"""Inspect Hostinger Node app config and force proper supervised start."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"


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
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
echo "=== config dirs ==="
ls -la /home/u402838766/.config/nextjs-nodejs 2>&1 | head -n 50
find /home/u402838766/.config -type f 2>/dev/null | head -n 40
echo "=== console tail ==="
tail -n 30 "{ROOT}/console.log"
echo "=== which port responds ==="
for p in 3000 3001 8080 4000 5000 5173; do
  code=$(curl -s -m 1 -o /dev/null -w "%{{http_code}}" http://127.0.0.1:$p/api/health 2>/dev/null || echo x)
  echo "port $p -> $code"
done
echo "=== lsof/ss ==="
command -v ss; command -v lsof; command -v netstat
ss -tlnp 2>&1 | head -n 40
lsof -iTCP -sTCP:LISTEN 2>&1 | head -n 40
echo "=== public_html ==="
ls -la /home/u402838766/domains/portal.pharmegichealthcare.com/public_html | head
cat /home/u402838766/domains/portal.pharmegichealthcare.com/public_html/.htaccess 2>/dev/null | head -n 40
""",
        timeout=60,
    )
    sys.stdout.buffer.write(out.read())
    e = err.read()
    if e:
        sys.stderr.buffer.write(e[-2500:])
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
