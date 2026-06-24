import fs from 'node:fs';
import path from 'node:path';
import { resolvePuppeteerProjectRoot } from '@/lib/puppeteer-runtime';

/** Writable dir for Chromium extract (avoid /tmp ulimit/noexec on Hostinger). */
export function ensureChromiumRuntimeDir(): string {
  const root = resolvePuppeteerProjectRoot();
  const dir = path.join(root, '.cache', 'chromium-runtime');
  fs.mkdirSync(dir, { recursive: true });

  process.env.TMPDIR = dir;
  process.env.TEMP = dir;
  process.env.TMP = dir;

  return dir;
}
