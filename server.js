// Hostinger Passenger entry — MUST listen in THIS process (no child spawn).
// Spawning `next start` causes: "App did not call listen() within 3 seconds" → 503.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const fs = require('fs');
const path = require('path');

function readPort() {
  const portFlagIndex = process.argv.indexOf('-p');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    return String(process.argv[portFlagIndex + 1]);
  }
  return String(process.env.PORT || process.env.LSNODE_APP_PORT || '3000');
}

const root = __dirname;
const port = readPort();
process.env.PORT = port;
delete process.env.HOSTNAME;
process.env.HOSTNAME = '0.0.0.0';

function defaultCertificatesRoot(appRoot) {
  const normalized = appRoot.replace(/\\/g, '/');
  const marker = '/hbuilds/versions/';
  const idx = normalized.indexOf(marker);
  if (idx >= 0) {
    return path.join(appRoot.slice(0, idx), 'public', 'uploads', 'certificates');
  }
  return path.join(appRoot, 'public', 'uploads', 'certificates');
}

if (!process.env.CERTIFICATES_UPLOAD_ROOT) {
  process.env.CERTIFICATES_UPLOAD_ROOT = defaultCertificatesRoot(root);
}
try {
  fs.mkdirSync(process.env.CERTIFICATES_UPLOAD_ROOT, { recursive: true });
} catch (_) {}

const standaloneDir = path.join(root, '.next', 'standalone');
const standaloneServer = path.join(standaloneDir, 'server.js');

console.info('[portal] NODE_ENV:', process.env.NODE_ENV);
console.info('[portal] Node.js:', process.version);
console.info('[portal] PORT:', port);
console.info('[portal] DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'MISSING');
console.info(
  '[portal] Standalone bundle:',
  fs.existsSync(standaloneServer) ? 'found' : 'missing'
);

function linkRuntimeUploads() {
  try {
    const uploadsSrc = process.env.CERTIFICATES_UPLOAD_ROOT
      ? path.dirname(process.env.CERTIFICATES_UPLOAD_ROOT)
      : path.join(root, 'public', 'uploads');
    const uploadsDest = path.join(standaloneDir, 'public', 'uploads');
    fs.mkdirSync(uploadsSrc, { recursive: true });
    fs.mkdirSync(path.join(uploadsSrc, 'certificates'), { recursive: true });
    fs.mkdirSync(path.dirname(uploadsDest), { recursive: true });

    let destStat = null;
    try {
      destStat = fs.lstatSync(uploadsDest);
    } catch (_) {}

    // Empty real dirs (from postbuild mkdir) block the symlink and cause /uploads 404s.
    if (destStat) {
      if (destStat.isSymbolicLink()) {
        console.info('[portal] uploads already linked → public/uploads');
        return;
      }
      try {
        fs.rmSync(uploadsDest, { recursive: true, force: true });
      } catch (err) {
        console.warn(
          '[portal] could not replace standalone uploads dir:',
          err && err.message ? err.message : err
        );
        return;
      }
    }

    fs.symlinkSync(uploadsSrc, uploadsDest, 'dir');
    console.info('[portal] Linked standalone/public/uploads → public/uploads');
  } catch (err) {
    console.warn('[portal] uploads link skipped:', err && err.message ? err.message : err);
  }
}

if (!fs.existsSync(standaloneServer)) {
  console.error('[portal] FATAL: .next/standalone/server.js missing. Run npm run build.');
  process.exit(1);
}

linkRuntimeUploads();

// PDF packages are copied into standalone/node_modules by postbuild. Keep them
// resolvable even if Passenger leaves cwd at the nodejs app root.
const standaloneNodeModules = path.join(standaloneDir, 'node_modules');
const rootNodeModules = path.join(root, 'node_modules');
const nodePathParts = [
  standaloneNodeModules,
  rootNodeModules,
  process.env.NODE_PATH || '',
].filter(Boolean);
process.env.NODE_PATH = nodePathParts.join(path.delimiter);
try {
  require('module').Module._initPaths();
} catch (_) {}

const pdfReady =
  fs.existsSync(path.join(standaloneNodeModules, 'puppeteer-core')) &&
  fs.existsSync(path.join(standaloneNodeModules, '@sparticuz', 'chromium-min'));
console.info('[portal] PDF deps in standalone/node_modules:', pdfReady ? 'found' : 'MISSING');
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
