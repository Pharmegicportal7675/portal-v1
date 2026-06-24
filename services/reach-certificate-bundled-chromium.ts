import type { Browser } from 'puppeteer-core';
import { getBundledChromiumPackUrl } from '@/lib/bundled-chromium-config';

/** Launch Puppeteer using @sparticuz/chromium-min when system Chrome is unavailable. */
export async function launchBundledChromiumBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');
  const chromiumModule = await import('@sparticuz/chromium-min');
  const chromium = chromiumModule.default;

  const executablePath = await chromium.executablePath(getBundledChromiumPackUrl());

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
