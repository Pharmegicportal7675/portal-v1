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

function packageDir(name) {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.split('/');
    return path.join('node_modules', scope, pkg);
  }
  return path.join('node_modules', name);
}

function collectPackageTree(packageName, collected = new Set()) {
  if (collected.has(packageName)) return collected;
  collected.add(packageName);

  const pkgJsonPath = path.join(root, packageDir(packageName), 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return collected;

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  for (const dep of Object.keys(deps)) {
    collectPackageTree(dep, collected);
  }

  return collected;
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

const workerScript = path.join(root, 'scripts', 'reach-html-to-pdf.cjs');
const workerDest = path.join(standaloneDir, 'scripts', 'reach-html-to-pdf.cjs');
const chromiumHelper = path.join(root, 'scripts', 'bundled-chromium-executable.cjs');
const chromiumHelperDest = path.join(standaloneDir, 'scripts', 'bundled-chromium-executable.cjs');
if (fs.existsSync(workerScript)) {
  fs.mkdirSync(path.dirname(workerDest), { recursive: true });
  fs.copyFileSync(workerScript, workerDest);
}
if (fs.existsSync(chromiumHelper)) {
  fs.mkdirSync(path.dirname(chromiumHelperDest), { recursive: true });
  fs.copyFileSync(chromiumHelper, chromiumHelperDest);
}

console.info('[postbuild] Ensuring PDF packages in standalone/node_modules…');

const pdfRoots = ['puppeteer-core', '@sparticuz/chromium-min'];
const packagesToCopy = new Set();

for (const pkg of pdfRoots) {
  for (const name of collectPackageTree(pkg)) {
    packagesToCopy.add(name);
  }
}

for (const name of [...packagesToCopy].sort()) {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.split('/');
    ensureNodeModulesCopy(scope, pkg);
  } else {
    ensureNodeModulesCopy(name);
  }
}

console.info(`[postbuild] Copied ${packagesToCopy.size} PDF-related packages into standalone.`);
console.info('[postbuild] Standalone bundle ready.');
