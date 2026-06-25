// Hostinger entry — bind 0.0.0.0 on $PORT (never use process.env.HOSTNAME on Linux).
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function readPort() {
  const portFlagIndex = process.argv.indexOf('-p');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    return process.argv[portFlagIndex + 1];
  }
  return process.env.PORT || '3000';
}

const root = __dirname;
const port = readPort();
process.env.PORT = String(port);
// Linux/Hostinger often sets HOSTNAME to the container name — Next must bind 0.0.0.0.
delete process.env.HOSTNAME;
process.env.HOSTNAME = '0.0.0.0';

const buildIdPath = path.join(root, '.next', 'BUILD_ID');
const standaloneDir = path.join(root, '.next', 'standalone');
const standaloneServer = path.join(standaloneDir, 'server.js');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

console.info('[portal] NODE_ENV:', process.env.NODE_ENV);
console.info('[portal] Node.js:', process.version);
console.info('[portal] PORT:', port);
console.info('[portal] DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'MISSING');
console.info('[portal] Standalone bundle:', fs.existsSync(standaloneServer) ? 'found' : 'missing');

function ensureChromiumRuntimeDir(baseDir) {
  const dir = path.join(baseDir, '.cache', 'chromium-runtime');
  fs.mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = dir;
  process.env.TEMP = dir;
  process.env.TMP = dir;
  return dir;
}

ensureChromiumRuntimeDir(root);

function verifyStandaloneBundle() {
  const required = [
    standaloneServer,
    path.join(standaloneDir, '.next', 'BUILD_ID'),
    path.join(standaloneDir, 'generated', 'prisma', 'index.js'),
    path.join(standaloneDir, 'node_modules', 'next', 'package.json'),
  ];
  const missing = required.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    console.error('[portal] FATAL: incomplete standalone bundle. Missing:');
    for (const file of missing) {
      console.error(`  - ${path.relative(root, file)}`);
    }
    console.error('[portal] Run "npm run build" on the server, then restart.');
    return false;
  }
  return true;
}

function linkRuntimeUploads() {
  const uploadsSrc = path.join(root, 'public', 'uploads');
  const uploadsDest = path.join(standaloneDir, 'public', 'uploads');
  if (!fs.existsSync(uploadsSrc)) return;

  fs.mkdirSync(path.dirname(uploadsDest), { recursive: true });
  if (fs.existsSync(uploadsDest)) return;

  try {
    fs.symlinkSync(uploadsSrc, uploadsDest, 'dir');
    console.info('[portal] Linked uploads → standalone/public/uploads');
  } catch {
    copyDir(uploadsSrc, uploadsDest);
    console.info('[portal] Copied uploads → standalone/public/uploads');
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function startStandalone() {
  if (!verifyStandaloneBundle()) {
    process.exit(1);
  }

  linkRuntimeUploads();
  ensureChromiumRuntimeDir(standaloneDir);
  console.info(`[portal] Starting Next.js standalone on 0.0.0.0:${port}`);

  try {
    process.chdir(standaloneDir);
    delete process.env.HOSTNAME;
    process.env.HOSTNAME = '0.0.0.0';
    require(standaloneServer);
  } catch (err) {
    console.error('[portal] FATAL: standalone server failed to start.');
    console.error(err);
    process.exit(1);
  }
}

function startNextCli() {
  if (!fs.existsSync(buildIdPath)) {
    console.error('[portal] FATAL: .next/BUILD_ID not found. Run "npm run build" before start.');
    process.exit(1);
  }
  if (!fs.existsSync(nextBin)) {
    console.error('[portal] FATAL: Next.js binary not found. Run "npm ci" first.');
    process.exit(1);
  }

  console.info(`[portal] Starting next start on 0.0.0.0:${port}`);
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '-H', '0.0.0.0', '-p', String(port)],
    { stdio: 'inherit', cwd: root, env: process.env }
  );

  function shutdown(signal) {
    console.info(`[portal] Received ${signal}, stopping Next.js…`);
    child.kill(signal);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  child.on('exit', (code, signal) => {
    if (signal) console.error(`[portal] Next.js stopped by signal ${signal}`);
    else if (code !== 0) console.error(`[portal] Next.js exited with code ${code}`);
    process.exit(code ?? 1);
  });
}

process.on('uncaughtException', (err) => {
  console.error('[portal] uncaughtException:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[portal] unhandledRejection:', reason);
  process.exit(1);
});

if (fs.existsSync(standaloneServer)) {
  startStandalone();
} else {
  console.warn('[portal] Standalone server.js not found — falling back to next start.');
  startNextCli();
}
