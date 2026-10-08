import fs from 'node:fs';
import path from 'node:path';
import type { createRequire as CreateRequireFn } from 'node:module';

function hasPdfDeps(root: string): boolean {
  return (
    fs.existsSync(path.join(root, 'node_modules', 'puppeteer-core')) &&
    fs.existsSync(path.join(root, 'node_modules', '@sparticuz', 'chromium-min'))
  );
}

function addCandidate(roots: string[], seen: Set<string>, candidate: string | null | undefined) {
  if (!candidate) return;
  const resolved = path.resolve(candidate);
  if (seen.has(resolved)) return;
  seen.add(resolved);
  roots.push(resolved);
}

/**
 * Find a folder that has package.json + puppeteer-core on disk.
 * Hostinger may keep cwd at `nodejs/` even when the app is served from
 * `.next/standalone`, so always search that folder explicitly.
 */
function resolveProjectRoot(): string {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const cwd = process.cwd();

  addCandidate(candidates, seen, cwd);
  addCandidate(candidates, seen, path.join(cwd, '.next', 'standalone'));
  addCandidate(candidates, seen, path.join(cwd, 'nodejs', '.next', 'standalone'));
  addCandidate(candidates, seen, path.join(cwd, '..'));
  addCandidate(candidates, seen, path.join(cwd, '..', '.next', 'standalone'));
  addCandidate(candidates, seen, path.join(cwd, '..', '..'));
  addCandidate(candidates, seen, path.join(cwd, '..', '..', '.next', 'standalone'));

  try {
    addCandidate(candidates, seen, path.join(__dirname, '..'));
    addCandidate(candidates, seen, path.join(__dirname, '..', '..'));
    addCandidate(candidates, seen, path.join(__dirname, '..', '..', '..'));
    addCandidate(candidates, seen, path.join(__dirname, '..', '..', '..', '.next', 'standalone'));
  } catch {
    // __dirname may be unavailable in some bundles
  }

  const withPdfDeps: string[] = [];
  const withPackageJson: string[] = [];

  for (const root of candidates) {
    if (!fs.existsSync(path.join(root, 'package.json'))) continue;
    withPackageJson.push(root);
    if (hasPdfDeps(root)) withPdfDeps.push(root);
  }

  if (withPdfDeps.length > 0) {
    const standalone = withPdfDeps.find(
      (entry) => entry.includes(`${path.sep}standalone${path.sep}`) || entry.endsWith(`${path.sep}standalone`)
    );
    return standalone || withPdfDeps[0]!;
  }

  return withPackageJson[0] || cwd;
}

/**
 * Real Node createRequire — never use the webpack-injected `createRequire` import.
 * On Hostinger that import becomes a non-function (`c is not a function`).
 */
function getNativeCreateRequire(): typeof CreateRequireFn {
  // webpack must not rewrite this call
  const nodeRequire = (0, eval)('require') as NodeRequire;
  const nodeModule = nodeRequire('module') as {
    createRequire?: typeof CreateRequireFn;
  };
  if (typeof nodeModule.createRequire !== 'function') {
    throw new Error('Native module.createRequire is unavailable in this runtime');
  }
  return nodeModule.createRequire.bind(nodeModule) as typeof CreateRequireFn;
}

function getModuleRequire(root = resolveProjectRoot()): NodeRequire {
  const createRequire = getNativeCreateRequire();
  const pkgJson = path.join(root, 'package.json');
  if (fs.existsSync(pkgJson)) {
    return createRequire(pkgJson);
  }

  const cwdPkg = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(cwdPkg)) {
    return createRequire(cwdPkg);
  }

  // createRequire only needs a path inside the resolve root
  return createRequire(path.join(root || process.cwd(), 'package.json'));
}

function loadFromRoot(root: string, packageName: string): unknown {
  const req = getModuleRequire(root);
  const absPackage = path.join(root, 'node_modules', packageName);

  try {
    return req(packageName);
  } catch (namedError) {
    if (fs.existsSync(absPackage)) {
      try {
        return req(absPackage);
      } catch {
        // fall through with original error
      }
    }
    throw namedError;
  }
}

export function loadPuppeteerCore(): typeof import('puppeteer-core') {
  const root = resolveProjectRoot();
  try {
    const mod = loadFromRoot(root, 'puppeteer-core') as {
      launch?: unknown;
      default?: { launch?: unknown };
    };
    const puppeteer =
      mod && typeof mod === 'object' && mod.default?.launch ? mod.default : mod;
    if (puppeteer && typeof puppeteer.launch === 'function') {
      return puppeteer as typeof import('puppeteer-core');
    }
    throw new Error('puppeteer-core loaded but launch() is missing');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const depsPresent = hasPdfDeps(root);
    throw new Error(
      `Cannot find module 'puppeteer-core' (root=${root}, cwd=${process.cwd()}, depsOnDisk=${depsPresent}). ${message}`
    );
  }
}

type BundledChromiumModule = {
  args: string[];
  setGraphicsMode?: boolean;
  executablePath: (input?: string | URL) => Promise<string>;
};

export function loadBundledChromiumModule(): BundledChromiumModule {
  const root = resolveProjectRoot();
  try {
    const mod = loadFromRoot(root, '@sparticuz/chromium-min') as
      | BundledChromiumModule
      | { default: BundledChromiumModule };
    if (mod && typeof mod === 'object' && 'default' in mod && mod.default) {
      return mod.default;
    }
    return mod as BundledChromiumModule;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot find module '@sparticuz/chromium-min' (root=${root}, cwd=${process.cwd()}). ${message}`
    );
  }
}

export function resolvePuppeteerProjectRoot(): string {
  return resolveProjectRoot();
}
