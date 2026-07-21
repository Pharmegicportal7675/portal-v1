"""Restore live portal: find next, npm ci if needed, start app."""
from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"

# Minimal Hostinger-safe entry: prefer next binary discovery, never hard-fail if
# next can be resolved via require.resolve.
SAFE_SERVER = r'''process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function readPort() {
  const i = process.argv.indexOf('-p');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.PORT || '3000';
}

const root = __dirname;
const port = String(readPort());
process.env.PORT = port;
delete process.env.HOSTNAME;
process.env.HOSTNAME = '0.0.0.0';

if (!process.env.CERTIFICATES_UPLOAD_ROOT) {
  process.env.CERTIFICATES_UPLOAD_ROOT = path.join(root, 'public', 'uploads', 'certificates');
}
try {
  fs.mkdirSync(process.env.CERTIFICATES_UPLOAD_ROOT, { recursive: true });
} catch (_) {}

function resolveNextBin() {
  const candidates = [
    path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
    path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    return require.resolve('next/dist/bin/next', { paths: [root] });
  } catch (_) {}
  try {
    const pkg = require.resolve('next/package.json', { paths: [root] });
    const bin = path.join(path.dirname(pkg), 'dist', 'bin', 'next');
    if (fs.existsSync(bin)) return bin;
  } catch (_) {}
  return null;
}

const standaloneServer = path.join(root, '.next', 'standalone', 'server.js');
const buildIdPath = path.join(root, '.next', 'BUILD_ID');

console.info('[portal] PORT', port, 'node', process.version);
console.info('[portal] standalone', fs.existsSync(standaloneServer));
console.info('[portal] build', fs.existsSync(buildIdPath));

function startNextCli() {
  const nextBin = resolveNextBin();
  console.info('[portal] nextBin', nextBin || 'MISSING');
  if (!nextBin) {
    console.error('[portal] FATAL: next binary missing. Run npm ci / npm install.');
    process.exit(1);
  }
  if (!fs.existsSync(buildIdPath)) {
    console.error('[portal] FATAL: missing .next/BUILD_ID');
    process.exit(1);
  }
  const child = spawn(process.execPath, [nextBin, 'start', '-H', '0.0.0.0', '-p', port], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.on('SIGINT', () => child.kill('SIGINT'));
  child.on('exit', (code, signal) => {
    console.error('[portal] next exit', code, signal);
    process.exit(code == null ? 1 : code);
  });
}

if (fs.existsSync(standaloneServer)) {
  try {
    process.chdir(path.dirname(standaloneServer));
    delete process.env.HOSTNAME;
    process.env.HOSTNAME = '0.0.0.0';
    require(standaloneServer);
  } catch (err) {
    console.error('[portal] standalone failed, fallback next start', err);
    process.chdir(root);
    startNextCli();
  }
} else {
  startNextCli();
}
'''


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

    def run(cmd: str, timeout: int = 120) -> str:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        out.channel.recv_exit_status()
        return o + (("\n" + e) if e.strip() else "")

    print("=== locate next / node_modules ===")
    print(
        run(
            f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
node -v
ls -la node_modules 2>&1 | head
ls -la node_modules/next 2>&1 | head
ls -la node_modules/next/dist/bin 2>&1 | head
du -sh node_modules 2>&1
ls -la package-lock.json yarn.lock pnpm-lock.yaml 2>&1 | head
"""
        )
    )

    # Upload safe server.js first
    sftp = client.open_sftp()
    with sftp.file(f"{ROOT}/server.js", "w") as f:
        f.write(SAFE_SERVER)
    sftp.close()
    print("Uploaded SAFE_SERVER")

    # If next missing, run npm ci (long)
    check = run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
if [ -f node_modules/next/dist/bin/next ] || [ -f node_modules/next/dist/bin/next.js ]; then
  echo NEXT_OK
else
  echo NEXT_MISSING
fi
"""
    )
    print(check)

    if "NEXT_MISSING" in check:
        print("=== npm ci (this may take a few minutes) ===")
        print(
            run(
                f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
npm ci --omit=dev 2>&1 | tail -n 40
ls -la node_modules/next/dist/bin 2>&1 | head
""",
                timeout=600,
            )
        )

    # Kill stale next-server zombies and start via Hostinger-style node server.js
    print("=== restart app ===")
    print(
        run(
            f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
# stop zombie next-server processes for this app
pkill -f "next-server" 2>/dev/null || true
sleep 2
mkdir -p tmp
touch tmp/restart.txt
# Start the way Hostinger does: node server.js -p $PORT
# Use PORT 3000 which logs showed earlier
nohup node server.js -p 3000 > /tmp/portal-boot.log 2>&1 &
echo BOOT_PID=$!
sleep 4
echo "=== boot log ==="
cat /tmp/portal-boot.log | tail -n 50
echo "=== processes ==="
ps aux | grep -E 'next-server|server.js' | grep -v grep | head
echo "=== local curl ==="
curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:3000/api/health || echo curl_fail
""",
            timeout=90,
        )
    )

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
