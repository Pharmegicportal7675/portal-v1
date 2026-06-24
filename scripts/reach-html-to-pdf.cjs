'use strict';

const fs = require('fs');
const path = require('path');
const { access } = require('fs/promises');
const {
  ensureChromiumRuntimeDir,
  resolveBundledChromiumExecutable,
} = require('./bundled-chromium-executable.cjs');

const WORKER_ROOT = path.resolve(__dirname, '..');

ensureChromiumRuntimeDir(WORKER_ROOT);
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar';

const MIN_NODE_MAJOR = 20;

const VIEWPORTS = {
  reach: { width: 794, height: 1123 },
  tcc: { width: 794, height: 2246 },
};

const ROOT_SELECTORS = {
  reach: '[data-reach-cert-root]',
  tcc: '[data-tcc-cert-root]',
};

process.chdir(WORKER_ROOT);

function logFilePath() {
  return process.env.REACH_PDF_LOG_FILE || '';
}

function appendLog(message) {
  const line = `[pdf-worker] ${message}\n`;
  try {
    process.stderr.write(line);
  } catch {
    // ignore broken pipe
  }
  const logFile = logFilePath();
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line);
    } catch {
      // ignore
    }
  }
}

function exitWithError(err, code = 1) {
  const message = err && (err.stack || err.message) ? err.stack || err.message : String(err);
  appendLog(`error: ${message}`);
  appendLog(`exit code=${code}`);
  process.exit(code);
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (major < MIN_NODE_MAJOR) {
    exitWithError(
      new Error(
        `Node ${process.version} is too old for PDF generation (need >= ${MIN_NODE_MAJOR}). Set Hostinger Node.js to 20.x or 22.x.`
      )
    );
  }
}

function moduleSearchPaths() {
  const paths = new Set();
  const add = (root) => {
    const nm = path.join(root, 'node_modules');
    if (fs.existsSync(nm)) paths.add(nm);
  };

  add(WORKER_ROOT);
  add(path.join(WORKER_ROOT, '..', '..'));
  add(path.join(WORKER_ROOT, '..'));

  if (process.env.NODE_PATH) {
    for (const entry of process.env.NODE_PATH.split(path.delimiter)) {
      if (entry.trim()) paths.add(entry.trim());
    }
  }

  return [...paths];
}

function requirePackage(name) {
  const paths = moduleSearchPaths();
  try {
    return require(require.resolve(name, { paths }));
  } catch (err) {
    appendLog(`Failed to load ${name} (searched: ${paths.join(', ')}): ${err instanceof Error ? err.message : err}`);
    throw err;
  }
}

function chromeCandidates() {
  const fromEnv = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH].filter(Boolean);
  return [
    ...fromEnv,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

async function resolveSystemChrome() {
  for (const candidate of chromeCandidates()) {
    try {
      await access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

const HOSTING_CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--renderer-process-limit=2',
];

function mergeChromiumArgs(base) {
  const merged = [...(base || [])];
  for (const arg of HOSTING_CHROMIUM_ARGS) {
    if (!merged.includes(arg)) merged.push(arg);
  }
  return merged.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote');
}

async function closeBrowserSafely(browser) {
  try {
    await browser.close();
  } catch (err) {
    appendLog(`browser.close failed: ${err instanceof Error ? err.message : err}`);
    try {
      browser.process()?.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
}

async function launchBrowser() {
  ensureChromiumRuntimeDir(WORKER_ROOT);
  const puppeteer = requirePackage('puppeteer-core');

  if (process.env.REACH_PDF_USE_BUNDLED_CHROMIUM !== '1') {
    const systemPath = await resolveSystemChrome();
    if (systemPath) {
      appendLog(`Using system Chrome: ${systemPath}`);
      return puppeteer.launch({
        headless: true,
        executablePath: systemPath,
        pipe: true,
        args: mergeChromiumArgs(['--font-render-hinting=none']),
      });
    }
  }

  appendLog('Using bundled Chromium (@sparticuz/chromium-min)');
  const chromiumMod = requirePackage('@sparticuz/chromium-min');
  const chromium = chromiumMod.default || chromiumMod;

  try {
    chromium.setGraphicsMode = false;
  } catch {
    // optional
  }

  const executablePath = await resolveBundledChromiumExecutable(chromium, CHROMIUM_PACK_URL, WORKER_ROOT);
  appendLog(`Chromium executable: ${executablePath}`);

  return puppeteer.launch({
    args: mergeChromiumArgs(chromium.args),
    executablePath,
    headless: true,
    pipe: true,
  });
}

async function waitForPdfReady(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    );
  });
}

function absolutizeAssetUrls(html) {
  const baseUrl = (process.env.REACH_PDF_RENDER_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(
    /\/$/,
    ''
  );
  if (!baseUrl) return html;

  return html.replace(
    /(\s(?:src|href)=["'])(\/(?!\/)[^"']*)(["'])/gi,
    (_match, prefix, assetPath, suffix) => `${prefix}${baseUrl}${assetPath}${suffix}`
  );
}

async function generatePdf(html, format) {
  const viewport = VIEWPORTS[format] || VIEWPORTS.reach;
  const rootSelector = ROOT_SELECTORS[format] || ROOT_SELECTORS.reach;
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.setContent(absolutizeAssetUrls(html), { waitUntil: 'load', timeout: 60_000 });
    await page.waitForSelector(rootSelector, { timeout: 30_000 });
    await page.waitForSelector('[data-reach-pdf-ready="true"]', { timeout: 30_000 });
    await waitForPdfReady(page);

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
    await closeBrowserSafely(browser);
  }
}

async function runCheck() {
  appendLog(`check node=${process.version} root=${WORKER_ROOT}`);
  appendLog(`NODE_PATH=${process.env.NODE_PATH || '(unset)'}`);
  appendLog(`REACH_PDF_USE_BUNDLED_CHROMIUM=${process.env.REACH_PDF_USE_BUNDLED_CHROMIUM || '(unset)'}`);

  const puppeteer = requirePackage('puppeteer-core');
  appendLog(`puppeteer-core loaded (launch=${typeof puppeteer.launch})`);

  const chromiumMod = requirePackage('@sparticuz/chromium-min');
  const chromium = chromiumMod.default || chromiumMod;
  appendLog(`@sparticuz/chromium-min loaded (args=${Array.isArray(chromium.args)})`);

  const chrome = await resolveSystemChrome();
  appendLog(`systemChrome=${chrome || 'not found'}`);

  process.exit(0);
}

async function main() {
  assertNodeVersion();
  appendLog(`start node=${process.version} root=${WORKER_ROOT} argv=${process.argv.slice(2).join(' ')}`);

  const arg1 = process.argv[2];

  if (arg1 === '--check') {
    await runCheck();
    return;
  }

  const htmlPath = arg1;
  const format = process.argv[3] === 'tcc' ? 'tcc' : 'reach';

  if (!htmlPath) {
    throw new Error('Usage: node reach-html-to-pdf.cjs <htmlFile>|--check [reach|tcc]');
  }

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file not found: ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  appendLog(`html bytes=${html.length}`);

  const pdf = await generatePdf(html, format);
  if (!pdf.length) {
    throw new Error('Generated PDF is empty');
  }

  appendLog(`pdf bytes=${pdf.length}`);
  fs.writeSync(1, pdf);
}

process.on('uncaughtException', (err) => exitWithError(err));
process.on('unhandledRejection', (err) => exitWithError(err));

main().catch((err) => exitWithError(err));
