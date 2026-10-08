import fs from 'node:fs';
import path from 'node:path';

const CERTIFICATES_RELATIVE = path.join('public', 'uploads', 'certificates');
const HOSTINGER_VERSIONS_MARKER = '/hbuilds/versions/';

/** Hostinger replaces hbuilds/versions/<id> on each deploy. Keep uploads beside that folder. */
function persistentCertificatesRoot(fromPath: string | undefined): string | null {
  if (!fromPath) return null;
  const normalized = fromPath.replace(/\\/g, '/');
  const idx = normalized.indexOf(HOSTINGER_VERSIONS_MARKER);
  if (idx < 0) return null;
  return path.resolve(path.join(fromPath.slice(0, idx), 'public', 'uploads', 'certificates'));
}

function addIfPresent(roots: Set<string>, candidate: string | null | undefined) {
  if (!candidate) return;
  roots.add(path.resolve(candidate));
}

/** Previous deploy folders still hold PO files written before the latest upload. */
function addHostingerDeployRoots(roots: Set<string>) {
  const hints = [process.cwd(), process.env.CERTIFICATES_UPLOAD_ROOT, ...roots];
  for (const hint of hints) {
    if (!hint) continue;
    const normalized = String(hint).replace(/\\/g, '/');
    const idx = normalized.indexOf(HOSTINGER_VERSIONS_MARKER);
    if (idx < 0) continue;

    const domainRoot = String(hint).slice(0, idx);
    addIfPresent(roots, path.join(domainRoot, 'public', 'uploads', 'certificates'));
    addIfPresent(roots, path.join(domainRoot, 'nodejs', 'public', 'uploads', 'certificates'));

    const versionsDir = path.join(domainRoot, 'hbuilds', 'versions');
    let versions: string[] = [];
    try {
      versions = fs.readdirSync(versionsDir);
    } catch {
      continue;
    }
    for (const version of versions) {
      addIfPresent(
        roots,
        path.join(versionsDir, version, 'nodejs', 'public', 'uploads', 'certificates')
      );
      addIfPresent(
        roots,
        path.join(versionsDir, version, 'nodejs', '.next', 'standalone', 'public', 'uploads', 'certificates')
      );
    }
  }
}

/** Resolve every directory that may hold certificate / PO files on this host. */
function getCertificatesUploadRoots(): string[] {
  const roots = new Set<string>();

  const envRoot = process.env.CERTIFICATES_UPLOAD_ROOT?.trim();
  addIfPresent(roots, envRoot);
  addIfPresent(roots, persistentCertificatesRoot(envRoot || process.cwd()));

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, CERTIFICATES_RELATIVE),
    path.join(cwd, '.next', 'standalone', CERTIFICATES_RELATIVE),
    path.join(cwd, '..', CERTIFICATES_RELATIVE),
    path.join(cwd, '..', '..', CERTIFICATES_RELATIVE),
    path.join(cwd, '..', '..', '..', CERTIFICATES_RELATIVE),
  ];

  for (const candidate of candidates) {
    addIfPresent(roots, candidate);
  }

  addHostingerDeployRoots(roots);

  return [...roots].filter((root) => {
    try {
      return fs.existsSync(root) && fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Primary upload root used for new writes. Prefer Hostinger public/uploads, not standalone. */
export function getPrimaryCertificatesUploadRoot(): string {
  const envRoot = process.env.CERTIFICATES_UPLOAD_ROOT?.trim();
  const persistent = persistentCertificatesRoot(envRoot || process.cwd());
  if (persistent) return persistent;
  if (envRoot) return path.resolve(envRoot);

  const roots = getCertificatesUploadRoots();
  const preferred = roots.find(
    (root) => !root.replace(/\\/g, '/').includes('/.next/standalone/')
  );
  if (preferred) return preferred;
  if (roots.length > 0) return roots[0]!;

  return path.join(process.cwd(), CERTIFICATES_RELATIVE);
}

function normalizeRelativePath(relative: string): string {
  return relative.replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Same rules as upload — spaces and special chars become underscores. */
function sanitizeStorageFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Copy a file found in an old deploy folder into the folder that survives the next deploy. */
function keepCertificateFileInPrimaryRoot(relative: string, foundPath: string): string {
  if (!foundPath.replace(/\\/g, '/').includes(HOSTINGER_VERSIONS_MARKER)) return foundPath;

  const segments = normalizeRelativePath(relative).split('/').filter(Boolean);
  if (segments.length === 0) return foundPath;

  const primaryPath = path.join(getPrimaryCertificatesUploadRoot(), ...segments);
  if (path.resolve(foundPath) === path.resolve(primaryPath)) return foundPath;

  try {
    if (fs.existsSync(primaryPath) && fs.statSync(primaryPath).isFile()) return foundPath;
    fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
    fs.copyFileSync(foundPath, primaryPath);
    return primaryPath;
  } catch {
    return foundPath;
  }
}

function fileNameVariants(fileName: string): string[] {
  const trimmed = fileName.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed, sanitizeStorageFileName(trimmed)]);
  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded !== trimmed) {
      variants.add(decoded);
      variants.add(sanitizeStorageFileName(decoded));
    }
  } catch {
    // ignore
  }

  return [...variants].filter(Boolean);
}

/** Try to open a file under any known upload root. */
export function resolveCertificatesFilePath(relativePath: string): string | null {
  const relative = normalizeRelativePath(relativePath);
  if (!relative) return null;

  const segments = relative.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] || '';
  const parentSegments = segments.slice(0, -1);
  const nameCandidates = fileNameVariants(fileName);

  for (const root of getCertificatesUploadRoots()) {
    for (const name of nameCandidates) {
      const fullPath = path.join(root, ...parentSegments, name);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return keepCertificateFileInPrimaryRoot(relative, fullPath);
        }
      } catch {
        // try next candidate
      }
    }
  }

  return null;
}

/** Search using several filename variants (original, sanitized, decoded). */
export function findCertificatesFileByNames(fileNames: string[]): string | null {
  const seen = new Set<string>();
  for (const fileName of fileNames) {
    for (const variant of fileNameVariants(fileName)) {
      const key = variant.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const match = findCertificatesFileByExactName(variant);
      if (match) return match;
    }
  }
  return null;
}

function findCertificatesFileByExactName(fileName: string): string | null {
  const target = fileName.trim();
  if (!target) return null;

  const targetLower = target.toLowerCase();

  function walk(dir: string, depth: number): string | null {
    if (depth > 8) return null;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === targetLower) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = walk(fullPath, depth + 1);
        if (nested) return nested;
      }
    }

    return null;
  }

  for (const root of getCertificatesUploadRoots()) {
    const match = walk(root, 0);
    if (match) return match;
  }

  return null;
}
