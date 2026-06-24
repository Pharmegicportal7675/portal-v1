import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser, LaunchOptions } from 'puppeteer-core';
import {
  isReachPuppeteerPdfAvailable,
  resolveSystemChromeExecutable,
  usesBundledChromiumFallback,
} from '@/lib/reach-pdf-environment';
import { loadPuppeteerCore } from '@/lib/puppeteer-runtime';
import { launchBundledChromiumBrowser } from '@/services/reach-certificate-bundled-chromium';

export { isReachPuppeteerPdfAvailable, resolveSystemChromeExecutable, usesBundledChromiumFallback };

function usePdfWorker(): boolean {
  return (
    process.env.REACH_PDF_USE_WORKER === '1' ||
    (process.platform === 'linux' && process.env.NODE_ENV === 'production')
  );
}

function resolveWorkerScript(): string {
  const roots = [
    process.cwd(),
    path.join(process.cwd(), '..', '..'),
    path.join(__dirname, '..', '..'),
  ];

  for (const root of roots) {
    const candidate = path.join(root, 'scripts', 'reach-html-to-pdf.cjs');
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('PDF worker script not found (scripts/reach-html-to-pdf.cjs). Redeploy the app.');
}

async function runPdfWorker(html: string, format: 'reach' | 'tcc'): Promise<Buffer> {
  const htmlPath = path.join(tmpdir(), `reach-pdf-${randomUUID()}.html`);
  const scriptPath = resolveWorkerScript();

  await writeFile(htmlPath, html, 'utf8');

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(process.execPath, [scriptPath, htmlPath, format], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', async (code) => {
      await unlink(htmlPath).catch(() => {});

      if (code !== 0) {
        const detail = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(detail || `PDF worker exited with code ${code ?? 'unknown'}`));
        return;
      }

      resolve(Buffer.concat(stdoutChunks));
    });
  });
}

function prefersBundledChromium(): boolean {
  return process.env.REACH_PDF_USE_BUNDLED_CHROMIUM === '1';
}

async function launchSystemChromeBrowser(): Promise<Browser | null> {
  const executablePath = await resolveSystemChromeExecutable();
  if (!executablePath) return null;

  const puppeteer = loadPuppeteerCore();

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
  if (!prefersBundledChromium()) {
    const systemBrowser = await launchSystemChromeBrowser();
    if (systemBrowser) return systemBrowser;
  }

  if (usesBundledChromiumFallback()) {
    return launchBundledChromiumBrowser();
  }

  throw new Error(
    'Chromium/Chrome not found for PDF generation. Install Google Chrome or enable bundled Chromium on Linux.'
  );
}

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

async function generateHtmlPdfInProcess(html: string, format: 'reach' | 'tcc'): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const viewport =
    format === 'tcc'
      ? { width: 794, height: 2246, deviceScaleFactor: 1 as const }
      : { width: 794, height: 1123, deviceScaleFactor: 1 as const };
  const rootSelector = format === 'tcc' ? '[data-tcc-cert-root]' : '[data-reach-cert-root]';

  try {
    await page.setViewport(viewport);
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForSelector(rootSelector, { timeout: 30_000 });
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

export async function generateTccHtmlPdfFromHtml(html: string): Promise<Buffer> {
  if (usePdfWorker()) return runPdfWorker(html, 'tcc');
  return generateHtmlPdfInProcess(html, 'tcc');
}

export async function generateReachHtmlPdfFromHtml(html: string): Promise<Buffer> {
  if (usePdfWorker()) return runPdfWorker(html, 'reach');
  return generateHtmlPdfInProcess(html, 'reach');
}
