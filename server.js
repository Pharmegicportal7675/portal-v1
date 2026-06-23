// Hostinger entry — binds 0.0.0.0 and uses platform PORT (see deployment.md)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function readPort() {
  const portFlagIndex = process.argv.indexOf('-p');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    return process.argv[portFlagIndex + 1];
  }
  return process.env.PORT || '3000';
}

const port = readPort();
const hostname = process.env.HOSTNAME || '0.0.0.0';
const root = __dirname;
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const buildIdPath = path.join(root, '.next', 'BUILD_ID');

if (!fs.existsSync(nextBin)) {
  console.error('[portal] Next.js binary not found. Run npm ci && npm run build first.');
  process.exit(1);
}

if (!fs.existsSync(buildIdPath)) {
  console.error('[portal] Missing .next/BUILD_ID. Run npm run build before npm run start.');
  process.exit(1);
}

console.info(`[portal] Starting Next.js on http://${hostname}:${port}`);

const child = spawn(
  process.execPath,
  [nextBin, 'start', '-H', hostname, '-p', String(port)],
  { stdio: 'inherit', cwd: root, env: process.env },
);

child.on('error', (error) => {
  console.error('[portal] Failed to start Next.js:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[portal] Next.js stopped by signal: ${signal}`);
  } else if (code && code !== 0) {
    console.error(`[portal] Next.js exited with code ${code}`);
  }
  process.exit(code ?? 1);
});
