import puppeteer from 'puppeteer-core';
import type { Browser, LaunchOptions } from 'puppeteer-core';
import { isVercelHosting } from '@/lib/hosting';
import { launchBundledChromiumBrowser } from '@/services/reach-certificate-puppeteer-vercel';

function isServerlessHosting(): boolean {
  return isVercelHosting() || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Shared hosting / VPS: launch fresh Chromium per request instead of reusing a long-lived process. */
function useEphemeralBrowser(): boolean {
  return (
    isServerlessHosting() ||
    process.platform === 'linux' ||
    process.env.NODE_ENV === 'production' ||
    process.env.REACH_PDF_CLOSE_BROWSER === '1'
  );
}

function prefersBundledChromium(): boolean {
  return process.env.REACH_PDF_USE_BUNDLED_CHROMIUM === '1';
}

function chromeCandidates(): string[] {
  const fromEnv = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH].filter(
    (value): value is string => Boolean(value?.trim())
  );

  if (process.platform === 'win32') {
    return [
      ...fromEnv,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
  }

  return [
    ...fromEnv,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

export async function resolveSystemChromeExecutable(): Promise<string | null> {
  const { access } = await import('node:fs/promises');

  for (const candidate of chromeCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next path
    }
  }

  return null;
}

async function launchSystemChromeBrowser(): Promise<Browser | null> {
  const executablePath = await resolveSystemChromeExecutable();
  if (!executablePath) return null;

  const options: LaunchOptions = {
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  };

  try {
    return await puppeteer.launch(options);
  } catch (err) {
    console.warn('[reach-pdf] System Chrome launch failed:', err);
    return null;
  }
}

async function launchBrowser(): Promise<Browser> {
  if (isServerlessHosting()) {
    return launchBundledChromiumBrowser();
  }

  if (!prefersBundledChromium()) {
    const systemBrowser = await launchSystemChromeBrowser();
    if (systemBrowser) return systemBrowser;
  }

  if (process.platform === 'linux' || prefersBundledChromium()) {
    return launchBundledChromiumBrowser();
  }

  throw new Error(
    'Chromium/Chrome not found for PDF generation. Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH.'
  );
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (useEphemeralBrowser()) {
    return launchBrowser();
  }

  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function closeBrowserIfNeeded(browser: Browser): Promise<void> {
  if (useEphemeralBrowser()) {
    await browser.close();
  }
}

export async function generateTccHtmlPdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 794, height: 2246, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForSelector('[data-tcc-cert-root]', { timeout: 30_000 });
    await page.waitForSelector('[data-reach-pdf-ready="true"]', { timeout: 30_000 });

    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolve) => {
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

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
    await closeBrowserIfNeeded(browser);
  }
}

export async function generateReachHtmlPdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForSelector('[data-reach-cert-root]', { timeout: 30_000 });
    await page.waitForSelector('[data-reach-pdf-ready="true"]', { timeout: 30_000 });

    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolve) => {
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

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
    await closeBrowserIfNeeded(browser);
  }
}

export function isReachPuppeteerPdfAvailable(): boolean {
  return process.env.REACH_PDF_DISABLED !== '1';
}

export function usesServerlessChromium(): boolean {
  return isServerlessHosting();
}

export function usesBundledChromiumFallback(): boolean {
  return process.platform === 'linux' || prefersBundledChromium() || isServerlessHosting();
}
