/**
 * Run live-only repairs (DB path fix + optional HTTP trigger after deploy).
 * Does NOT write certificate files locally.
 *
 * Usage:
 *   node scripts/run-live-repair.mjs
 *   node scripts/run-live-repair.mjs --trigger-api
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const triggerApi = process.argv.includes('--trigger-api');

function runNodeScript(relativePath, args = []) {
  const scriptPath = path.join(root, relativePath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('=== Live DB path repair (remote MySQL only) ===');
runNodeScript('scripts/fix-tcc-file-url-paths.mjs');

if (triggerApi) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'https://portal.pharmegichealthcare.com';
  const secret = process.env.REPAIR_ATTACHMENTS_SECRET?.trim();
  if (!secret) {
    console.error('Set REPAIR_ATTACHMENTS_SECRET in hPanel to use --trigger-api.');
    process.exit(1);
  }

  console.log(`\n=== Trigger live server PDF repair (${origin}) ===`);
  const response = await fetch(`${origin}/api/admin/repair-attachments`, {
    method: 'POST',
    headers: { 'x-repair-secret': secret },
  });
  const body = await response.text();
  console.log(response.status, body);
  if (!response.ok) process.exit(1);
} else {
  console.log('\nPDF files must be created ON the live server (not locally).');
  console.log('After hPanel redeploy, SSH and run:');
  console.log('  cd ~/domains/portal.pharmegichealthcare.com/nodejs && bash scripts/deploy-live.sh');
  console.log('Or set REPAIR_ATTACHMENTS_SECRET and run:');
  console.log('  node scripts/run-live-repair.mjs --trigger-api');
}
