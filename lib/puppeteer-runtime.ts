import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function resolveProjectRoot(): string {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), '..', '..'),
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..'),
    path.join(__dirname, '..', '..', '..'),
  ];

  const seen = new Set<string>();
  const withPdfDeps: string[] = [];
  const withPackageJson: string[] = [];

  for (const root of candidates) {
    const resolved = path.resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    if (!fs.existsSync(path.join(resolved, 'package.json'))) continue;
    withPackageJson.push(resolved);

    const hasPuppeteer = fs.existsSync(path.join(resolved, 'node_modules', 'puppeteer-core'));
    const hasChromium = fs.existsSync(path.join(resolved, 'node_modules', '@sparticuz', 'chromium-min'));
    if (hasPuppeteer && hasChromium) {
      withPdfDeps.push(resolved);
    }
  }

  if (withPdfDeps.length > 0) {
    const standalone = withPdfDeps.find(
      (entry) => entry.includes(`${path.sep}standalone${path.sep}`) || entry.endsWith(`${path.sep}standalone`)
    );
    return standalone || withPdfDeps[0];
  }

  return withPackageJson[0] || process.cwd();
}

/** Load runtime deps via Node require — bypasses Next.js hashed external module loader on Hostinger. */
function projectRequire() {
  return createRequire(path.join(resolveProjectRoot(), 'package.json'));
}

export function loadPuppeteerCore(): typeof import('puppeteer-core') {
  return projectRequire()('puppeteer-core');
}

export function loadBundledChromiumModule() {
  const mod = projectRequire()('@sparticuz/chromium-min');
  return mod?.default ?? mod;
}

export function resolvePuppeteerProjectRoot(): string {
  return resolveProjectRoot();
}
