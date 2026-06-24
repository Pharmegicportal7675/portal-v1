import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { getBundledChromiumPackUrl } from '@/lib/bundled-chromium-config';

async function clearChromiumTempDirs(): Promise<void> {
  const tmp = os.tmpdir();
  for (const dir of ['chromium-pack', 'chromium']) {
    try {
      await fs.promises.rm(path.join(tmp, dir), { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

async function resolveBundledExecutablePath(): Promise<string> {
  const chromiumModule = await import('@sparticuz/chromium-min');
  const chromium = chromiumModule.default;
  const packUrl = getBundledChromiumPackUrl();

  try {
    return await chromium.executablePath(packUrl);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'EEXIST' || message.includes('EEXIST')) {
      await clearChromiumTempDirs();
      return chromium.executablePath(packUrl);
    }
    throw err;
  }
}

/** Launch Puppeteer using @sparticuz/chromium-min when system Chrome is unavailable. */
export async function launchBundledChromiumBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');
  const chromiumModule = await import('@sparticuz/chromium-min');
  const chromium = chromiumModule.default;
  const executablePath = await resolveBundledExecutablePath();

  return puppeteer.default.launch({
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
