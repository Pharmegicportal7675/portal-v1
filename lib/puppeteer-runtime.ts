import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function resolveProjectRoot(): string {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), '..', '..'),
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..'),
  ];

  for (const root of candidates) {
    if (fs.existsSync(path.join(root, 'package.json'))) return root;
  }

  return process.cwd();
}

/** Load runtime deps via Node require — bypasses Next.js hashed external module loader on Hostinger. */
function projectRequire() {
  return createRequire(path.join(resolveProjectRoot(), 'package.json'));
}

export function loadPuppeteerCore(): typeof import('puppeteer-core') {
  return projectRequire()('puppeteer-core');
}

export function loadBundledChromiumModule(): typeof import('@sparticuz/chromium-min').default {
  const mod = projectRequire()('@sparticuz/chromium-min');
  return (mod?.default ?? mod) as typeof import('@sparticuz/chromium-min').default;
}
