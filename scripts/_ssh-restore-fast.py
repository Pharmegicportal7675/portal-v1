"""Find previous Hostinger builds and restore ASAP with Passenger-safe server."""
from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
BUILDS = "/home/u402838766/domains/portal.pharmegichealthcare.com/public_html/.builds"

# Immediate listen() for Passenger, then prepare Next in-process.
# Works without standalone when a valid .next build exists.
SERVER = r'''process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const http = require('http');
const { parse } = require('url');
const path = require('path');
const fs = require('fs');
const next = require('next');

function readPort() {
  const i = process.argv.indexOf('-p');
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return Number(process.env.PORT || process.env.LSNODE_APP_PORT || 3000);
}

const root = __dirname;
const port = readPort();
process.env.PORT = String(port);
delete process.env.HOSTNAME;
process.env.HOSTNAME = '0.0.0.0';

if (!process.env.CERTIFICATES_UPLOAD_ROOT) {
  process.env.CERTIFICATES_UPLOAD_ROOT = path.join(root, 'public', 'uploads', 'certificates');
}
try { fs.mkdirSync(process.env.CERTIFICATES_UPLOAD_ROOT, { recursive: true }); } catch (_) {}

console.info('[portal] passenger-http PORT=' + port + ' node=' + process.version);

const standaloneServer = path.join(root, '.next', 'standalone', 'server.js');
if (fs.existsSync(standaloneServer)) {
  try {
    const uploadsSrc = path.join(root, 'public', 'uploads');
    const uploadsDest = path.join(root, '.next', 'standalone', 'public', 'uploads');
    fs.mkdirSync(path.dirname(uploadsDest), { recursive: true });
    if (!fs.existsSync(uploadsDest)) {
      try { fs.symlinkSync(uploadsSrc, uploadsDest, 'dir'); } catch (_) {}
    }
  } catch (_) {}
  process.chdir(path.join(root, '.next', 'standalone'));
  delete process.env.HOSTNAME;
  process.env.HOSTNAME = '0.0.0.0';
  require(standaloneServer);
} else {
  // No standalone: listen immediately (Passenger 3s rule), prepare Next after.
  const app = next({ dev: false, dir: root, hostname: '0.0.0.0', port });
  const handle = app.getRequestHandler();
  let ready = false;
  let prepareError = null;

  const server = http.createServer((req, res) => {
    if (!ready) {
      if (prepareError) {
        res.statusCode = 500;
        res.end('Portal failed to start: ' + String(prepareError));
        return;
      }
      res.statusCode = 503;
      res.setHeader('Retry-After', '2');
      res.end('Starting…');
      return;
    }
    handle(req, res, parse(req.url, true));
  });

  server.listen(port, '0.0.0.0', () => {
    console.info('[portal] listening on 0.0.0.0:' + port + ' (preparing Next…)');
  });

  app.prepare().then(() => {
    ready = true;
    console.info('[portal] Next ready');
  }).catch((err) => {
    prepareError = err && err.message ? err.message : err;
    console.error('[portal] prepare failed', err);
  });
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

    def run(cmd: str, timeout: int = 180) -> str:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        out.channel.recv_exit_status()
        text = o + (("\n" + e) if e.strip() else "")
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        if not text.endswith("\n"):
            sys.stdout.buffer.write(b"\n")
        return text

    print("=== builds cache ===")
    run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
ls -la "{BUILDS}" 2>&1 | head -n 40
find "{BUILDS}" -maxdepth 3 -type d -name standalone 2>/dev/null | head
find "{BUILDS}" -maxdepth 4 -name BUILD_ID 2>/dev/null | head
ls -la "{ROOT}/.next" 2>&1 | head
test -f "{ROOT}/.next/BUILD_ID" && echo HAS_BUILD_ID=$(cat "{ROOT}/.next/BUILD_ID") || echo NO_BUILD_ID
"""
    )

    sftp = client.open_sftp()
    with sftp.file(f"{ROOT}/server.js", "w") as f:
        f.write(SERVER)
    sftp.close()
    print("Uploaded immediate-listen server.js")

    # Install missing build deps and try to keep existing .next if present
    run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
# ensure next can prepare with production deps
npm install @tailwindcss/postcss --no-save 2>&1 | tail -n 15
pkill -f next-server || true
pkill -f 'node server.js' || true
sleep 1
mkdir -p tmp
echo restart=$(date -Iseconds) > tmp/restart.txt
sleep 6
tail -n 40 console.log
echo "=== local health ==="
for i in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl -s -m 2 -o /tmp/h.json -w "%{{http_code}}" http://127.0.0.1:3000/api/health || echo x)
  echo try_$i=$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
  if [ "$code" = "503" ]; then head -c 80 /tmp/h.json; echo; fi
  sleep 2
done
ps aux | grep -E 'node|next' | grep -v grep | head
""",
        timeout=300,
    )

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
