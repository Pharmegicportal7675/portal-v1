import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const standaloneDir = path.join(root, '.next', 'standalone');

if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  console.info('[postbuild] No standalone output — skipping asset copy.');
  process.exit(0);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureNodeModulesCopy(...segments) {
  const src = path.join(root, 'node_modules', ...segments);
  const dest = path.join(standaloneDir, 'node_modules', ...segments);
  if (!fs.existsSync(src)) {
    console.warn(`[postbuild] Missing package: node_modules/${segments.join('/')}`);
    return;
  }
  copyDir(src, dest);
}

console.info('[postbuild] Copying static assets into standalone bundle…');

copyDir(path.join(root, 'public'), path.join(standaloneDir, 'public'));
copyDir(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
copyDir(path.join(root, 'templates'), path.join(standaloneDir, 'templates'));
copyDir(path.join(root, 'generated'), path.join(standaloneDir, 'generated'));

// PDF runtime — createRequire loads from standalone/node_modules on Hostinger
console.info('[postbuild] Ensuring PDF packages in standalone/node_modules…');
ensureNodeModulesCopy('puppeteer-core');
ensureNodeModulesCopy('@sparticuz', 'chromium-min');
ensureNodeModulesCopy('@puppeteer', 'browsers');
ensureNodeModulesCopy('chromium-bidi');
ensureNodeModulesCopy('devtools-protocol');
ensureNodeModulesCopy('ws');

console.info('[postbuild] Standalone bundle ready.');
