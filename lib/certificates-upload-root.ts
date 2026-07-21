import fs from 'node:fs';
import path from 'node:path';

const CERTIFICATES_RELATIVE = path.join('public', 'uploads', 'certificates');

/** Resolve every directory that may hold certificate / PO files on this host. */
export function getCertificatesUploadRoots(): string[] {
  const roots = new Set<string>();

  const envRoot = process.env.CERTIFICATES_UPLOAD_ROOT?.trim();
  if (envRoot) roots.add(path.resolve(envRoot));

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, CERTIFICATES_RELATIVE),
    path.join(cwd, '.next', 'standalone', CERTIFICATES_RELATIVE),
    path.join(cwd, '..', CERTIFICATES_RELATIVE),
    path.join(cwd, '..', '..', CERTIFICATES_RELATIVE),
    path.join(cwd, '..', '..', '..', CERTIFICATES_RELATIVE),
  ];

  for (const candidate of candidates) {
    roots.add(path.resolve(candidate));
  }

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
export function sanitizeStorageFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
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
          return fullPath;
        }
      } catch {
        // try next candidate
      }
    }
  }

  return null;
}

/** Last-resort lookup when DB path and legacy transforms do not match on disk. */
export function findCertificatesFileByName(fileName: string): string | null {
  for (const variant of fileNameVariants(fileName)) {
    const match = findCertificatesFileByExactName(variant);
    if (match) return match;
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
