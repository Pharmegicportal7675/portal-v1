/**
 * List regenerated certificate files ready to upload to Hostinger.
 * Upload each file to:
 *   nodejs/public/uploads/certificates/<relative-path>
 *
 * Usage: node scripts/list-uploads-for-live.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uploadRoot = path.join(root, 'public', 'uploads', 'certificates');

if (!fs.existsSync(uploadRoot)) {
  console.log('No local uploads folder yet.');
  process.exit(0);
}

const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}

walk(uploadRoot);

if (files.length === 0) {
  console.log('No files under public/uploads/certificates');
  process.exit(0);
}

console.log(`Found ${files.length} file(s) to sync to Hostinger:\n`);
console.log('Hostinger target base: nodejs/public/uploads/certificates/\n');

for (const full of files.sort()) {
  const relative = path.relative(uploadRoot, full).replace(/\\/g, '/');
  const stat = fs.statSync(full);
  console.log(`${relative}  (${Math.round(stat.size / 1024)} KB)`);
}

console.log('\nOn Hostinger (SSH), after git pull + deploy, run:');
console.log('  npm run regenerate:missing-tcc');
console.log('This writes directly to CERTIFICATES_UPLOAD_ROOT on the server (add-only).');
