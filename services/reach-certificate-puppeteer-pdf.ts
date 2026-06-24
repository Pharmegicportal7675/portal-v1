import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Browser, LaunchOptions } from 'puppeteer-core';
import {
  isReachPuppeteerPdfAvailable,
  resolveSystemChromeExecutable,
  usesBundledChromiumFallback,
} from '@/lib/reach-pdf-environment';
import { loadPuppeteerCore } from '@/lib/puppeteer-runtime';
import { launchBundledChromiumBrowser } from '@/services/reach-certificate-bundled-chromium';

export { isReachPuppeteerPdfAvailable, resolveSystemChromeExecutable, usesBundledChromiumFallback };

const execFileAsync = promisify(execFile);

function usePdfWorker(): boolean {
  return (
    process.env.REACH_PDF_USE_WORKER === '1' ||
    (process.platform === 'linux' && process.env.NODE_ENV === 'production')
  );
}

function resolveWorkerContext(): { scriptPath: string; workerRoot: string; nodePath: string } {
  const roots = [
    process.cwd(),
    path.join(process.cwd(), '..', '..'),
    path.join(__dirname, '..', '..'),
  ];

  const seen = new Set<string>();
  const options: Array<{ scriptPath: string; workerRoot: string; score: number }> = [];

  for (const root of roots) {
    const normalized = path.resolve(root);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const scriptPath = path.join(normalized, 'scripts', 'reach-html-to-pdf.cjs');
    if (!fs.existsSync(scriptPath)) continue;

    let score = 0;
    if (fs.existsSync(path.join(normalized, 'node_modules', 'puppeteer-core'))) score += 10;
    if (fs.existsSync(path.join(normalized, 'node_modules', '@sparticuz', 'chromium-min'))) score += 10;
    if (!normalized.includes(`${path.sep}standalone${path.sep}`) && !normalized.endsWith(`${path.sep}standalone`)) {
      score += 5;
    }

    options.push({ scriptPath, workerRoot: normalized, score });
  }

  if (options.length === 0) {
    throw new Error('PDF worker script not found (scripts/reach-html-to-pdf.cjs). Redeploy the app.');
  }

  options.sort((a, b) => b.score - a.score);
  const best = options[0];

  const nodePath = [
    path.join(best.workerRoot, 'node_modules'),
    path.join(process.cwd(), 'node_modules'),
    path.join(process.cwd(), '..', '..', 'node_modules'),
  ]
    .map((entry) => path.resolve(entry))
    .filter((entry, index, all) => fs.existsSync(entry) && all.indexOf(entry) === index)
    .join(path.delimiter);

  return { scriptPath: best.scriptPath, workerRoot: best.workerRoot, nodePath };
}

async function buildWorkerEnv(logPath: string, nodePath: string): Promise<NodeJS.ProcessEnv> {
  const systemChrome = await resolveSystemChromeExecutable();
  const useBundled =
    process.env.REACH_PDF_USE_BUNDLED_CHROMIUM === '1' ||
    (!systemChrome && usesBundledChromiumFallback());

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_PATH: nodePath,
    REACH_PDF_LOG_FILE: logPath,
    REACH_PDF_USE_BUNDLED_CHROMIUM: useBundled ? '1' : process.env.REACH_PDF_USE_BUNDLED_CHROMIUM,
  };

  if (!systemChrome) {
    delete env.PUPPETEER_EXECUTABLE_PATH;
    delete env.CHROME_PATH;
  }

  return env;
}

function formatWorkerFailure(
  context: { scriptPath: string; workerRoot: string; nodePath: string },
  detail: string,
  err?: { code?: string | number; signal?: string }
): string {
  const parts = [
    detail.trim(),
    `node=${process.version}`,
    `workerRoot=${context.workerRoot}`,
    `script=${context.scriptPath}`,
    context.nodePath ? `NODE_PATH=${context.nodePath}` : '',
    err?.code != null ? `exitCode=${err.code}` : '',
    err?.signal ? `signal=${err.signal}` : '',
  ].filter(Boolean);

  return parts.join('\n');
}

async function readWorkerDiagnostics(logPath: string, stderr: string): Promise<string> {
  let log = '';
  try {
    log = await readFile(logPath, 'utf8');
  } catch {
    // no log file
  }

  const parts = [stderr.trim(), log.trim()].filter(Boolean);
  return parts.join('\n');
}

export async function runPdfWorkerCheck(): Promise<string> {
  const context = resolveWorkerContext();
  const logPath = path.join(tmpdir(), `reach-pdf-check-${randomUUID()}.log`);

  try {
    const env = await buildWorkerEnv(logPath, context.nodePath);
    const { stderr } = await execFileAsync(process.execPath, [context.scriptPath, '--check'], {
      cwd: context.workerRoot,
      env,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });

    return (stderr || 'PDF worker check passed').trim();
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; message?: string; code?: string | number; signal?: string };
    const detail = await readWorkerDiagnostics(logPath, execErr.stderr || execErr.message || String(err));
    throw new Error(formatWorkerFailure(context, detail || 'PDF worker check failed', execErr));
  } finally {
    await unlink(logPath).catch(() => {});
  }
}

async function runPdfWorker(html: string, format: 'reach' | 'tcc'): Promise<Buffer> {
  const htmlPath = path.join(tmpdir(), `reach-pdf-${randomUUID()}.html`);
  const logPath = `${htmlPath}.log`;
  const context = resolveWorkerContext();
  const workerTimeoutMs = Number(process.env.REACH_PDF_WORKER_TIMEOUT_MS || '110000');

  await writeFile(htmlPath, html, 'utf8');

  try {
    const env = await buildWorkerEnv(logPath, context.nodePath);
    const { stdout } = await execFileAsync(process.execPath, [context.scriptPath, htmlPath, format], {
      cwd: context.workerRoot,
      env,
      timeout: workerTimeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      encoding: 'buffer',
    });

    const pdf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    if (!pdf.length) {
      const detail = await readWorkerDiagnostics(logPath, '');
      throw new Error(formatWorkerFailure(context, detail || 'PDF worker returned an empty file'));
    }

    return pdf;
  } catch (err: unknown) {
    const execErr = err as { stderr?: string | Buffer; message?: string; code?: string | number; signal?: string };
    const stderr =
      typeof execErr.stderr === 'string'
        ? execErr.stderr
        : Buffer.isBuffer(execErr.stderr)
          ? execErr.stderr.toString('utf8')
          : execErr.message || String(err);

    const detail = await readWorkerDiagnostics(logPath, stderr);
    throw new Error(formatWorkerFailure(context, detail || 'PDF worker failed', execErr));
  } finally {
    await unlink(htmlPath).catch(() => {});
    await unlink(logPath).catch(() => {});
  }
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
