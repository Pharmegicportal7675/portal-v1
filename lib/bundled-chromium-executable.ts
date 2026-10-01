import fs from 'node:fs';
import path from 'node:path';

const HOST_TMP_CHROMIUM = '/tmp/chromium';
const HOST_TMP_PACK = '/tmp/chromium-pack';

export function ensureChromiumRuntimeDir(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const dir = path.join(root, '.cache', 'chromium-runtime');
  fs.mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = dir;
  process.env.TEMP = dir;
  process.env.TMP = dir;
  return dir;
}

export async function pathIsExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function clearBundledChromiumArtifacts(runtimeDir: string): Promise<void> {
  const targets = [
    path.join(runtimeDir, 'chromium'),
    path.join(runtimeDir, 'chromium-pack'),
    HOST_TMP_CHROMIUM,
    HOST_TMP_PACK,
  ];

  for (const target of targets) {
    try {
      await fs.promises.rm(target, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function resolveBundledChromiumExecutable(
  chromium: { executablePath: (packUrl: string) => Promise<string>; setGraphicsMode?: boolean },
  packUrl: string,
  projectRoot?: string
): Promise<string> {
  const runtimeDir = ensureChromiumRuntimeDir(projectRoot);
  const localBin = path.join(runtimeDir, 'chromium');

  if (await pathIsExecutable(localBin)) {
    return localBin;
  }

  let extractedPath: string;
  try {
    extractedPath = await chromium.executablePath(packUrl);
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'EEXIST' || message.includes('EEXIST')) {
      await clearBundledChromiumArtifacts(runtimeDir);
      extractedPath = await chromium.executablePath(packUrl);
    } else {
      throw err;
    }
  }

  if (extractedPath !== localBin) {
    await fs.promises.copyFile(extractedPath, localBin);
    await fs.promises.chmod(localBin, 0o755);
  }

  return localBin;
}
