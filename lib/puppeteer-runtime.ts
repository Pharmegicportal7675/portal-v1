import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

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
 * Hostinger runs from `.next/standalone` after server.js chdir; also search parents.
 */
function resolveProjectRoot(): string {
  const seen = new Set<string>();
  const candidates: string[] = [];

  addCandidate(candidates, seen, process.cwd());
  addCandidate(candidates, seen, path.join(process.cwd(), '..'));
  addCandidate(candidates, seen, path.join(process.cwd(), '..', '..'));
  addCandidate(candidates, seen, path.join(process.cwd(), '..', '..', '..'));

  try {
    addCandidate(candidates, seen, path.join(__dirname, '..'));
    addCandidate(candidates, seen, path.join(__dirname, '..', '..'));
    addCandidate(candidates, seen, path.join(__dirname, '..', '..', '..'));
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

  return withPackageJson[0] || process.cwd();
}

/**
 * Always use Node createRequire from a real package.json.
 * Never use ambient `require` — Next.js webpack injects one that cannot resolve
 * external packages like puppeteer-core on Hostinger.
 */
function getModuleRequire(root = resolveProjectRoot()): NodeRequire {
  const pkgJson = path.join(root, 'package.json');
  if (fs.existsSync(pkgJson)) {
    return createRequire(pkgJson);
  }

  try {
    return createRequire(path.join(process.cwd(), 'package.json'));
  } catch {
    // fallback
  }

  return createRequire(import.meta.url);
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
    throw new Error(
      `Cannot find module 'puppeteer-core' (root=${root}, cwd=${process.cwd()}). ${message}`
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
