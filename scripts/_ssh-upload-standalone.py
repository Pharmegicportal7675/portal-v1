"""Upload local standalone tarball to Hostinger and restart Passenger."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
TGZ = Path(os.environ.get("TEMP", "/tmp")) / "portal-standalone.tgz"

SERVER = r'''process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const path = require('path');
const fs = require('fs');
function readPort() {
  const i = process.argv.indexOf('-p');
  if (i !== -1 && process.argv[i + 1]) return String(process.argv[i + 1]);
  return String(process.env.PORT || process.env.LSNODE_APP_PORT || 3000);
}
const root = __dirname;
const port = readPort();
process.env.PORT = port;
delete process.env.HOSTNAME;
process.env.HOSTNAME = '0.0.0.0';
if (!process.env.CERTIFICATES_UPLOAD_ROOT) {
  process.env.CERTIFICATES_UPLOAD_ROOT = path.join(root, 'public', 'uploads', 'certificates');
}
try { fs.mkdirSync(process.env.CERTIFICATES_UPLOAD_ROOT, { recursive: true }); } catch (_) {}
const standaloneDir = path.join(root, '.next', 'standalone');
const standaloneServer = path.join(standaloneDir, 'server.js');
console.info('[portal] PORT=' + port + ' standalone=' + fs.existsSync(standaloneServer));
if (!fs.existsSync(standaloneServer)) {
  console.error('[portal] FATAL missing standalone');
  process.exit(1);
}
try {
  const src = path.join(root, 'public', 'uploads');
  const dest = path.join(standaloneDir, 'public', 'uploads');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) { try { fs.symlinkSync(src, dest, 'dir'); } catch (_) {} }
} catch (_) {}
process.chdir(standaloneDir);
delete process.env.HOSTNAME;
process.env.HOSTNAME = '0.0.0.0';
require(standaloneServer);
'''


def main() -> int:
    if not TGZ.exists():
        print("Missing", TGZ, file=sys.stderr)
        return 1
    password = os.environ["HOSTINGER_SSH_PASSWORD"]
    print(f"Uploading {TGZ} ({TGZ.stat().st_size / 1e6:.1f} MB)...")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        port=PORT,
        username=USER,
        password=password,
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
        banner_timeout=60,
    )
    sftp = client.open_sftp()
    remote_tgz = f"{ROOT}/portal-standalone.tgz"
    sftp.put(str(TGZ), remote_tgz)
    with sftp.file(f"{ROOT}/server.js", "w") as f:
        f.write(SERVER)
    sftp.close()
    print("Upload complete. Extracting...")

    _i, out, err = client.exec_command(
        f"""
set -e
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
mkdir -p .next
rm -rf .next/standalone
tar -xzf portal-standalone.tgz -C .next
test -f .next/standalone/server.js
echo STANDALONE_OK
# Ensure BUILD_ID exists for diagnostics
if [ -f .next/standalone/.next/BUILD_ID ]; then
  cp -f .next/standalone/.next/BUILD_ID .next/BUILD_ID || true
  echo BUILD_ID=$(cat .next/BUILD_ID)
fi
rm -f portal-standalone.tgz
mkdir -p tmp
echo restart=$(date -Iseconds) > tmp/restart.txt
sleep 10
tail -n 25 console.log
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  code=$(curl -s -m 3 -o /tmp/h.json -w "%{{http_code}}" http://127.0.0.1:3000/api/health || echo x)
  echo try_$i=$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
  sleep 2
done
""",
        timeout=300,
    )
    sys.stdout.buffer.write(out.read())
    e = err.read()
    if e:
        sys.stderr.buffer.write(e[-3000:])
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
