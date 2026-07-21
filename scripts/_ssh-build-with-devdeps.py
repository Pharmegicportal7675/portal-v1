"""Build on Hostinger with devDependencies included."""
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
LOCAL = Path(__file__).resolve().parents[1]


def load_db_url() -> str:
    for name in (".env.local", ".env"):
        p = LOCAL / name
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    password = os.environ["HOSTINGER_SSH_PASSWORD"]
    db_url = load_db_url()
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

    def run(cmd: str, timeout: int = 900) -> str:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        code = out.channel.recv_exit_status()
        text = o + (("\n" + e[-5000:]) if e.strip() else "")
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        sys.stdout.buffer.write(f"\n[exit={code}]\n".encode())
        return text

    # Upload current passenger-safe server.js from local
    sftp = client.open_sftp()
    server = r'''process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const http = require('http');
const { parse } = require('url');
const path = require('path');
const fs = require('fs');

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

console.info('[portal] PORT=' + port + ' node=' + process.version);

const standaloneServer = path.join(root, '.next', 'standalone', 'server.js');
if (fs.existsSync(standaloneServer)) {
  try {
    const src = path.join(root, 'public', 'uploads');
    const dest = path.join(root, '.next', 'standalone', 'public', 'uploads');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) { try { fs.symlinkSync(src, dest, 'dir'); } catch (_) {} }
  } catch (_) {}
  process.chdir(path.join(root, '.next', 'standalone'));
  delete process.env.HOSTNAME;
  process.env.HOSTNAME = '0.0.0.0';
  require(standaloneServer);
} else {
  const next = require('next');
  const app = next({ dev: false, dir: root, hostname: '0.0.0.0', port });
  const handle = app.getRequestHandler();
  let ready = false;
  let prepareError = null;
  const server = http.createServer((req, res) => {
    if (!ready) {
      res.statusCode = prepareError ? 500 : 503;
      res.end(prepareError ? ('Start failed: ' + prepareError) : 'Starting…');
      return;
    }
    handle(req, res, parse(req.url, true));
  });
  server.listen(port, '0.0.0.0', () => console.info('[portal] listening ' + port));
  app.prepare().then(() => { ready = true; console.info('[portal] ready'); })
    .catch((err) => { prepareError = err && err.message ? err.message : String(err); console.error(err); });
}
'''
    with sftp.file(f"{ROOT}/server.js", "w") as f:
        f.write(server)
    sftp.close()

    run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd {shlex.quote(ROOT)}
export DATABASE_URL={shlex.quote(db_url)}
export NEXT_PUBLIC_APP_URL=https://portal.pharmegichealthcare.com
# CRITICAL: do NOT set NODE_ENV=production during npm ci or devDeps are skipped
unset NODE_ENV
npm ci --include=dev
test -d node_modules/@tailwindcss/postcss && echo TW_OK || echo TW_MISSING
ls node_modules/@tailwindcss 2>&1 | head
export NODE_ENV=production
export NODE_OPTIONS=--max-old-space-size=3072
npm run build
echo BUILD_EXIT=$?
test -f .next/BUILD_ID && echo BUILD_ID=$(cat .next/BUILD_ID) || echo NO_BUILD
test -f .next/standalone/server.js && echo STANDALONE=yes || echo STANDALONE=no
mkdir -p tmp
echo restart=$(date -Iseconds) > tmp/restart.txt
sleep 12
tail -n 20 console.log
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  code=$(curl -s -m 3 -o /tmp/h.json -w "%{{http_code}}" http://127.0.0.1:3000/api/health || echo x)
  echo try_$i=$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
  sleep 2
done
""",
        timeout=900,
    )
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
