"""Passenger-compatible fix: build standalone + in-process server.js + restart."""
from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"

# Hostinger Passenger requires the ENTRY FILE itself to call listen().
# Spawning `next start` as a child causes: "App did not call listen() within 3 seconds".
PASSENGER_SERVER = r'''// Hostinger Passenger entry — MUST listen in THIS process (no child spawn).
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const fs = require('fs');
const path = require('path');

function readPort() {
  const i = process.argv.indexOf('-p');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.PORT || process.env.LSNODE_APP_PORT || '3000';
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

const standaloneDir = path.join(root, '.next', 'standalone');
const standaloneServer = path.join(standaloneDir, 'server.js');

console.info('[portal] Passenger entry PORT=' + port + ' node=' + process.version);
console.info('[portal] standalone=' + fs.existsSync(standaloneServer));

if (!fs.existsSync(standaloneServer)) {
  console.error('[portal] FATAL: .next/standalone/server.js missing. Run npm run build.');
  process.exit(1);
}

// Symlink uploads into standalone public (best-effort, never block listen).
try {
  const src = path.join(root, 'public', 'uploads');
  const dest = path.join(standaloneDir, 'public', 'uploads');
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    if (!fs.existsSync(dest)) fs.symlinkSync(src, dest, 'dir');
  } catch (_) {}
} catch (_) {}

// Chromium temp dir
try {
  const tmp = path.join(standaloneDir, '.cache', 'chromium-runtime');
  fs.mkdirSync(tmp, { recursive: true });
  process.env.TMPDIR = tmp;
  process.env.TEMP = tmp;
  process.env.TMP = tmp;
} catch (_) {}

process.chdir(standaloneDir);
require(standaloneServer);
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
        text = o + (("\n" + e) if e.strip() else "")
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        if not text.endswith("\n"):
            sys.stdout.buffer.write(b"\n")
        return text

    run(f'cat /home/u402838766/.config/nextjs-nodejs/config.json; echo')

    # Upload passenger-safe server.js
    sftp = client.open_sftp()
    with sftp.file(f"{ROOT}/server.js", "w") as f:
        f.write(PASSENGER_SERVER)
    sftp.close()
    print("Uploaded passenger server.js")

    # Kill unsupervised next so Passenger can take over after build
    run("pkill -f next-server || true; pkill -f 'node server.js' || true")
    time.sleep(2)

    # Build standalone (required)
    print("=== npm run build (standalone) ===")
    run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
# Ensure env for prisma generate if needed
export NODE_OPTIONS="--max-old-space-size=3072"
npm run build
echo BUILD_EXIT=$?
ls -la .next/standalone/server.js 2>&1 | head
ls -la .next/standalone/.next/BUILD_ID 2>&1 | head
""",
        timeout=900,
    )

    # Passenger restart
    run(
        f"""
mkdir -p "{ROOT}/tmp"
touch "{ROOT}/tmp/restart.txt"
echo restarted_at=$(date -Iseconds) > "{ROOT}/tmp/restart.txt"
sleep 4
echo "=== console ==="
tail -n 25 "{ROOT}/console.log"
echo "=== health ==="
curl -s -m 5 http://127.0.0.1:3000/api/health || curl -s -m 5 http://127.0.0.1:$PORT/api/health || echo health_fail
"""
    )

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
