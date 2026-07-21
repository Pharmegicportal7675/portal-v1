"""Check listening ports and Hostinger app config for proxy mismatch."""
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
cd "{ROOT}"
echo "=== listen ==="
ss -lptn 2>/dev/null || netstat -lptn 2>/dev/null
echo "=== local health ==="
curl -s -m 3 http://127.0.0.1:3000/api/health; echo
echo "=== public from server ==="
curl -s -m 10 -o /tmp/pub.html -w "PUB=%{{http_code}}\\n" https://portal.pharmegichealthcare.com/api/health || echo PUB=fail
head -c 200 /tmp/pub.html; echo
echo "=== hpanel / passenger hints ==="
ls -la ../ 2>&1 | head
ls -la . | head -n 40
find . -maxdepth 2 -name '*.json' -o -name 'ecosystem*' -o -name '.env*' 2>/dev/null | head
cat .env 2>/dev/null | sed 's/=.*/=***/' | head
ls -la /home/u402838766/.nvm 2>/dev/null | head
# Hostinger nodejs app metadata
ls -la /home/u402838766/.zpanel* 2>/dev/null | head
find /home/u402838766 -name '*nodejs*' -type d 2>/dev/null | head -n 20
ps aux | grep -E 'next-server|node ' | grep -v grep
""",
        timeout=90,
    )
    sys.stdout.buffer.write(out.read())
    e = err.read()
    if e:
        sys.stderr.buffer.write(e[-2000:])
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
