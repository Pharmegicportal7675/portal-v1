import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { getBundledChromiumLaunchArgs } from '@/lib/chromium-launch-args';
import { ensureChromiumRuntimeDir } from '@/lib/chromium-runtime-dir';
import { formatPdfLaunchError } from '@/lib/format-pdf-launch-error';
import { getBundledChromiumPackUrl } from '@/lib/bundled-chromium-config';
import { loadBundledChromiumModule, loadPuppeteerCore } from '@/lib/puppeteer-runtime';

async function clearChromiumExtractDirs(runtimeDir: string): Promise<void> {
  for (const dir of ['chromium-pack', 'chromium']) {
    try {
      await fs.promises.rm(path.join(runtimeDir, dir), { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

async function resolveBundledExecutablePath(): Promise<string> {
  const runtimeDir = ensureChromiumRuntimeDir();
  const chromium = loadBundledChromiumModule();
  const packUrl = getBundledChromiumPackUrl();

  try {
    chromium.setGraphicsMode = false;
  } catch {
    // optional — reduces RAM on shared hosting
  }

  try {
    return await chromium.executablePath(packUrl);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'EEXIST' || message.includes('EEXIST')) {
      await clearChromiumExtractDirs(runtimeDir);
      return chromium.executablePath(packUrl);
    }
    throw err;
  }
}

/** Launch Puppeteer using @sparticuz/chromium-min when system Chrome is unavailable. */
export async function launchBundledChromiumBrowser(): Promise<Browser> {
  ensureChromiumRuntimeDir();
  const puppeteer = loadPuppeteerCore();
  const chromium = loadBundledChromiumModule();

  try {
    const executablePath = await resolveBundledExecutablePath();
    return await puppeteer.launch({
      args: getBundledChromiumLaunchArgs(chromium.args),
      executablePath,
      headless: true,
      pipe: true,
    });
  } catch (err) {
    throw formatPdfLaunchError(err);
  }
}
