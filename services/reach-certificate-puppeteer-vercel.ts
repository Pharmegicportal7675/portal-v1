import puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { getVercelChromiumPackUrl } from '@/lib/vercel-chromium-config';

/** Launch Puppeteer on Vercel using @sparticuz/chromium-min + remote pack (ESM dynamic import). */
export async function launchVercelPuppeteerBrowser(): Promise<Browser> {
  const chromiumModule = await import('@sparticuz/chromium-min');
  const chromium = chromiumModule.default;

  chromium.setGraphicsMode = false;

  const executablePath = await chromium.executablePath(getVercelChromiumPackUrl());
  const args = await puppeteer.defaultArgs({
    args: chromium.args,
    headless: 'shell',
  });

  return puppeteer.launch({
    args,
    defaultViewport: {
      width: 794,
      height: 1123,
      deviceScaleFactor: 1,
    },
    executablePath,
    headless: 'shell',
  });
}
