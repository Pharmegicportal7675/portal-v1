import { createRequire } from 'node:module';
import path from 'node:path';

/** Load runtime deps via Node require — bypasses Next.js hashed external module loader on Hostinger. */
function projectRequire() {
  return createRequire(path.join(process.cwd(), 'package.json'));
}

export function loadPuppeteerCore(): typeof import('puppeteer-core') {
  return projectRequire()('puppeteer-core');
}

export function loadBundledChromiumModule(): typeof import('@sparticuz/chromium-min').default {
  const mod = projectRequire()('@sparticuz/chromium-min');
  return (mod?.default ?? mod) as typeof import('@sparticuz/chromium-min').default;
}
