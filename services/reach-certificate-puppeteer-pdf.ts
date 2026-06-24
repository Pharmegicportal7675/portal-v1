import type { Browser, LaunchOptions } from 'puppeteer-core';
import {
  isReachPuppeteerPdfAvailable,
  resolveSystemChromeExecutable,
} from '@/lib/reach-pdf-environment';

export { isReachPuppeteerPdfAvailable, resolveSystemChromeExecutable };

async function launchBrowser(): Promise<Browser> {
  const executablePath = await resolveSystemChromeExecutable();
  if (!executablePath) {
    throw new Error(
      'Chromium/Chrome not found for PDF generation. On Hostinger, install Google Chrome and set PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable'
    );
  }

  const puppeteer = await import('puppeteer-core');

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

  return puppeteer.default.launch(options);
}

/** Hostinger VPS: launch fresh Chromium per request instead of reusing a long-lived process. */
function useEphemeralBrowser(): boolean {
  return (
    process.platform === 'linux' ||
    process.env.NODE_ENV === 'production' ||
    process.env.REACH_PDF_CLOSE_BROWSER === '1'
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

