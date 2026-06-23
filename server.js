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

if (!fs.existsSync(buildIdPath)) {
  console.error('[portal] Missing .next/BUILD_ID. Run npm run build before npm run start.');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('[portal] DATABASE_URL is not set. Add it in hPanel environment variables, then redeploy.');
  process.exit(1);
}

console.info(`[portal] PORT=${port} HOST=${hostname} DATABASE_URL=set NODE_ENV=${process.env.NODE_ENV}`);

function spawnNext() {
  const args = ['start', '-H', hostname, '-p', String(port)];

  if (fs.existsSync(nextBin)) {
    return spawn(process.execPath, [nextBin, ...args], {
      stdio: 'inherit',
      cwd: root,
      env: process.env,
    });
  }

  console.warn('[portal] Next binary not found at expected path, falling back to npx next');
  return spawn('npx', ['next', ...args], {
    stdio: 'inherit',
    shell: true,
    cwd: root,
    env: process.env,
  });
}

console.info(`[portal] Starting Next.js on http://${hostname}:${port}`);

const child = spawnNext();

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
