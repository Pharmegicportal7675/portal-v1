'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { access } = require('fs/promises');

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
  const puppeteer = require('puppeteer-core');

  if (process.env.REACH_PDF_USE_BUNDLED_CHROMIUM !== '1') {
    const systemPath = await resolveSystemChrome();
    if (systemPath) {
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

  const chromiumMod = require('@sparticuz/chromium-min');
  const chromium = chromiumMod.default || chromiumMod;

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

async function generatePdf(html, format) {
  const viewport = VIEWPORTS[format] || VIEWPORTS.reach;
  const rootSelector = ROOT_SELECTORS[format] || ROOT_SELECTORS.reach;
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
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

  if (!htmlPath) {
    process.stderr.write('Usage: node reach-html-to-pdf.cjs <htmlFile> [reach|tcc]\n');
    process.exit(2);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const pdf = await generatePdf(html, format);
  process.stdout.write(pdf);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
