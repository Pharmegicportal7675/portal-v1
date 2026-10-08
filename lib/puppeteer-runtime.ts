import fs from 'node:fs';
import path from 'node:path';
import type { createRequire as CreateRequireFn } from 'node:module';

type NodeModuleApi = {
  createRequire: typeof CreateRequireFn;
};

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

function resolveBridgePath(root: string): string | null {
  const candidates = [
    path.join(root, 'scripts', 'load-pdf-native.cjs'),
    path.join(process.cwd(), 'scripts', 'load-pdf-native.cjs'),
    path.join(process.cwd(), '.next', 'standalone', 'scripts', 'load-pdf-native.cjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Obtain native Module.createRequire without relying on webpack's broken
 * `import { createRequire } from 'node:module'` binding (shows up as "c is not a function")
 * and without eval('require') which fails in pure ESM ("require is not defined").
 */
function getNativeCreateRequire(): typeof CreateRequireFn {
  const proc = process as NodeJS.Process & {
    getBuiltinModule?: (id: string) => NodeModuleApi | undefined;
  };

  if (typeof proc.getBuiltinModule === 'function') {
    const builtin = proc.getBuiltinModule('module');
    if (builtin && typeof builtin.createRequire === 'function') {
      return builtin.createRequire.bind(builtin) as typeof CreateRequireFn;
    }
  }

  // Last resort: dynamic import is async, so try a Function that only works if CJS globals exist
  try {
    // eslint-disable-next-line no-new-func
    const nodeRequire = new Function(
      'return (typeof require !== "undefined" && require) || (typeof globalThis !== "undefined" && globalThis.require) || null'
    )() as NodeRequire | null;
    if (nodeRequire) {
      const nodeModule = nodeRequire('module') as NodeModuleApi;
      if (typeof nodeModule.createRequire === 'function') {
        return nodeModule.createRequire.bind(nodeModule) as typeof CreateRequireFn;
      }
    }
  } catch {
    // ignore
  }

  throw new Error(
    'Native module.createRequire unavailable (ESM bundle). PDF will use the CJS worker process.'
  );
}

type PdfNativeBridge = {
  loadPuppeteerCore: (root: string) => typeof import('puppeteer-core');
  loadChromiumMin: (root: string) => BundledChromiumModule;
};

function loadBridge(root: string): PdfNativeBridge {
  const createRequire = getNativeCreateRequire();
  const bridgePath = resolveBridgePath(root);
  if (!bridgePath) {
    throw new Error(`scripts/load-pdf-native.cjs not found (root=${root}, cwd=${process.cwd()})`);
  }
  return createRequire(bridgePath)(bridgePath) as PdfNativeBridge;
}

export function loadPuppeteerCore(): typeof import('puppeteer-core') {
  const root = resolveProjectRoot();
  try {
    return loadBridge(root).loadPuppeteerCore(root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot find module 'puppeteer-core' (root=${root}, cwd=${process.cwd()}, depsOnDisk=${hasPdfDeps(root)}). ${message}`
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
    return loadBridge(root).loadChromiumMin(root);
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

/** True when this host should prefer the CJS PDF worker over in-process puppeteer. */
export function shouldPreferPdfWorker(): boolean {
  if (process.env.REACH_PDF_USE_WORKER === '1') return true;
  if (process.env.REACH_PDF_USE_WORKER === '0') return false;
  const cwd = process.cwd().replace(/\\/g, '/');
  return cwd.includes('/hbuilds/') || cwd.includes('/domains/');
}
