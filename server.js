// Hostinger entry — always bind 0.0.0.0 (never process.env.HOSTNAME)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function readPort() {
  const portFlagIndex = process.argv.indexOf('-p');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    return process.argv[portFlagIndex + 1];
  }
  return process.env.PORT || '3000';
}

const root = __dirname;
const port = readPort();
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const buildIdPath = path.join(root, '.next', 'BUILD_ID');

console.info('[portal] cwd:', root);
console.info('[portal] node:', process.version);
console.info('[portal] PORT:', port);
console.info('[portal] DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'MISSING');
console.info('[portal] BUILD_ID:', fs.existsSync(buildIdPath) ? 'ok' : 'MISSING');

if (!fs.existsSync(buildIdPath)) {
  console.error('[portal] Missing .next/BUILD_ID — run npm run build before start.');
  process.exit(1);
}

if (!fs.existsSync(nextBin)) {
  console.error('[portal] Next.js binary not found at', nextBin);
  process.exit(1);
}

console.info(`[portal] Starting Next.js on 0.0.0.0:${port}`);

const child = spawn(process.execPath, [nextBin, 'start', '-H', '0.0.0.0', '-p', String(port)], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

child.on('error', (error) => {
  console.error('[portal] Failed to start Next.js:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) console.error(`[portal] Next.js stopped by signal: ${signal}`);
  if (code) console.error(`[portal] Next.js exited with code ${code}`);
  process.exit(code ?? 1);
});
