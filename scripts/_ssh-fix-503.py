"""Read Hostinger console.log and fix server entry for 503."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
LOCAL = Path(__file__).resolve().parents[1]


def main() -> int:
    password = os.environ["HOSTINGER_SSH_PASSWORD"]
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        port=PORT,
        username=USER,
        password=password,
        timeout=45,
        allow_agent=False,
        look_for_keys=False,
    )

    _i, out, err = client.exec_command(
        f"""
set +e
cd "{ROOT}"
echo "=== console.log ==="
tail -n 80 console.log 2>/dev/null
echo "=== package start ==="
node -e "const p=require('./package.json'); console.log(JSON.stringify({{main:p.main,scripts:p.scripts}},null,2))"
echo "=== ports / listen ==="
ss -lptn 2>/dev/null | head -n 30 || netstat -lptn 2>/dev/null | head -n 30
echo "=== env sample ==="
# do not print secrets
env | grep -E '^(PORT|NODE_|HOSTNAME|APP_)' | sort
echo "=== next config output ==="
node -e "try{{const c=require('./next.config.js'); console.log('output', c.output||c.default?.output||'none')}}catch(e){{console.log(e.message)}}"
ls -la .next/standalone 2>&1 | head
ls -la node_modules/next/dist/bin/next 2>&1 | head
""",
        timeout=60,
    )
    sys.stdout.buffer.write(out.read())
    e = err.read().decode("utf-8", errors="replace")
    if e.strip():
        print(e[-1500:], file=sys.stderr)

    # Upload a safe Hostinger start entry that does NOT require standalone
    # and never exits hard during upload linking.
    safe_server = r'''// Hostinger entry — bind 0.0.0.0 on $PORT (never use process.env.HOSTNAME on Linux).
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
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  process.env.TMPDIR = dir;
  process.env.TEMP = dir;
  process.env.TMP = dir;
  return dir;
}

ensureChromiumRuntimeDir(root);

function isSymlink(targetPath) {
  try { return fs.lstatSync(targetPath).isSymbolicLink(); } catch { return false; }
}

function linkRuntimeUploads() {
  try {
    const uploadsSrc = path.join(root, 'public', 'uploads');
    const uploadsDest = path.join(standaloneDir, 'public', 'uploads');
    fs.mkdirSync(uploadsSrc, { recursive: true });
    fs.mkdirSync(path.join(uploadsSrc, 'certificates'), { recursive: true });
    if (!process.env.CERTIFICATES_UPLOAD_ROOT) {
      process.env.CERTIFICATES_UPLOAD_ROOT = path.join(uploadsSrc, 'certificates');
    }
    if (!fs.existsSync(standaloneDir)) return;
    fs.mkdirSync(path.dirname(uploadsDest), { recursive: true });
    if (isSymlink(uploadsDest)) {
      console.info('[portal] uploads already linked');
      return;
    }
    if (fs.existsSync(uploadsDest) && !isSymlink(uploadsDest)) {
      // Do not merge large trees at boot — just remove empty dest or leave it.
      try {
        const entries = fs.readdirSync(uploadsDest);
        if (entries.length === 0) fs.rmSync(uploadsDest, { recursive: true, force: true });
        else return;
      } catch (_) { return; }
    }
    try {
      fs.symlinkSync(uploadsSrc, uploadsDest, 'dir');
      console.info('[portal] Linked standalone/public/uploads -> public/uploads');
    } catch (err) {
      console.warn('[portal] Symlink skipped:', err.message || err);
    }
  } catch (err) {
    console.warn('[portal] linkRuntimeUploads skipped:', err.message || err);
  }
}

function startStandalone() {
  linkRuntimeUploads();
  ensureChromiumRuntimeDir(standaloneDir);
  console.info('[portal] Starting Next.js standalone on 0.0.0.0:' + port);
  process.chdir(standaloneDir);
  delete process.env.HOSTNAME;
  process.env.HOSTNAME = '0.0.0.0';
  require(standaloneServer);
}

function startNextCli() {
  if (!fs.existsSync(buildIdPath)) {
    console.error('[portal] FATAL: .next/BUILD_ID not found. Run build first.');
    process.exit(1);
  }
  if (!fs.existsSync(nextBin)) {
    console.error('[portal] FATAL: Next.js binary not found. Run npm ci first.');
    process.exit(1);
  }
  linkRuntimeUploads();
  console.info('[portal] Starting next start on 0.0.0.0:' + port);
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '-H', '0.0.0.0', '-p', String(port)],
    { stdio: 'inherit', cwd: root, env: process.env }
  );
  function shutdown(signal) {
    try { child.kill(signal); } catch (_) {}
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  child.on('exit', (code, signal) => {
    if (signal) console.error('[portal] Next.js stopped by signal ' + signal);
    else if (code !== 0) console.error('[portal] Next.js exited with code ' + code);
    process.exit(code == null ? 1 : code);
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
  try {
    startStandalone();
  } catch (err) {
    console.error('[portal] standalone failed, falling back to next start:', err);
    startNextCli();
  }
} else {
  console.warn('[portal] Standalone missing — using next start.');
  startNextCli();
}
'''

    sftp = client.open_sftp()
    remote_path = f"{ROOT}/server.js"
    with sftp.file(remote_path, "w") as f:
        f.write(safe_server)
    sftp.close()
    print("\nUploaded safe server.js")

    # Touch a restart signal Hostinger sometimes watches; also kill zombie nexts carefully
    _i, out2, err2 = client.exec_command(
        f"""
set +e
cd "{ROOT}"
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
# Hostinger Node app restart via touch tmp/restart.txt (Passenger-style) if present
mkdir -p tmp
touch tmp/restart.txt
date > tmp/restart.txt
# Show current next processes
ps aux | grep next-server | grep -v grep
# Local smoke: try next start briefly is dangerous; instead check if PORT responds on localhost
PORT_VAL=$(env | grep '^PORT=' | cut -d= -f2)
echo PORT_ENV=$PORT_VAL
# Try common Hostinger ports from listening sockets
ss -lptn 2>/dev/null | grep -E 'node|next' || true
# Read last console after a short wait (hPanel may restart)
sleep 2
tail -n 30 console.log
""",
        timeout=60,
    )
    sys.stdout.buffer.write(out2.read())
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
