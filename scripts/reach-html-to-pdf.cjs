'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { access } = require('fs/promises');

const WORKER_ROOT = path.resolve(__dirname, '..');
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.tar';

const VIEWPORTS = {
  reach: { width: 794, height: 1123 },
  tcc: { width: 794, height: 2246 },
};

const ROOT_SELECTORS = {
  reach: '[data-reach-cert-root]',
  tcc: '[data-tcc-cert-root]',
};

process.chdir(WORKER_ROOT);
process.env.NODE_PATH = path.join(WORKER_ROOT, 'node_modules');

function log(message) {
  process.stderr.write(`[pdf-worker] ${message}\n`);
}

function requirePackage(name) {
  try {
    return require(require.resolve(name, { paths: [path.join(WORKER_ROOT, 'node_modules')] }));
  } catch (err) {
    log(`Failed to load ${name} from ${WORKER_ROOT}: ${err instanceof Error ? err.message : err}`);
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
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function clearChromiumTemp() {
  for (const dir of ['chromium-pack', 'chromium']) {
    try {
      fs.rmSync(path.join(os.tmpdir(), dir), { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function launchBrowser() {
  const puppeteer = requirePackage('puppeteer-core');

  if (process.env.REACH_PDF_USE_BUNDLED_CHROMIUM !== '1') {
    const systemPath = await resolveSystemChrome();
    if (systemPath) {
      log(`Using system Chrome: ${systemPath}`);
      return puppeteer.launch({
        headless: true,
        executablePath: systemPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      });
    }
  }

  log('Using bundled Chromium (@sparticuz/chromium-min)');
  const chromiumMod = requirePackage('@sparticuz/chromium-min');
  const chromium = chromiumMod.default || chromiumMod;

  try {
    chromium.setGraphicsMode = false;
  } catch {
    // optional on older builds
  }

  let executablePath;
  try {
    executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'EEXIST' || message.includes('EEXIST')) {
      await clearChromiumTemp();
      executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    } else {
      throw err;
    }
  }

  return puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    executablePath,
    headless: true,
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
    await browser.close();
  }
}

async function main() {
  const htmlPath = process.argv[2];
  const format = process.argv[3] === 'tcc' ? 'tcc' : 'reach';

  log(`node=${process.version} root=${WORKER_ROOT} format=${format}`);

  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (major < 22) {
    throw new Error(
      `Node ${process.version} is too old for puppeteer-core 25 / @sparticuz/chromium-min 148. Set Hostinger Node.js to 22.x and redeploy.`
    );
  }

  if (!htmlPath) {
    throw new Error('Usage: node reach-html-to-pdf.cjs <htmlFile> [reach|tcc]');
  }

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file not found: ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  log(`html bytes=${html.length}`);

  const pdf = await generatePdf(html, format);
  log(`pdf bytes=${pdf.length}`);
  process.stdout.write(pdf);
}

process.on('uncaughtException', (err) => {
  log(`uncaught: ${err?.stack || err}`);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  log(`unhandled: ${err?.stack || err}`);
  process.exit(1);
});

main().catch((err) => {
  log(`error: ${err?.stack || err}`);
  process.exit(1);
});
