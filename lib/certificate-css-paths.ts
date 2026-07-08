import fs from 'node:fs';
import path from 'node:path';

/** Resolve certificate CSS on disk (dev root or Hostinger standalone bundle). */
export function resolveCertificateCssPath(fileName: string): string {
  const segments = ['components', fileName];
  const candidates = [
    path.join(process.cwd(), ...segments),
    path.join(process.cwd(), '..', ...segments),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Certificate CSS not found: components/${fileName}. Redeploy after npm run build.`
  );
}
