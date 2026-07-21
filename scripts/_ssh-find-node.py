"""Find node binary and PATH on Hostinger SSH."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"


def main() -> int:
    password = os.environ.get("HOSTINGER_SSH_PASSWORD", "").strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=HOST,
        port=PORT,
        username=USER,
        password=password,
        timeout=45,
        allow_agent=False,
        look_for_keys=False,
    )
    cmd = r"""
echo "SHELL=$SHELL"
echo "PATH=$PATH"
command -v node || true
ls -la ~/domains/portal.pharmegichealthcare.com/nodejs/node_modules/.bin/tsx 2>/dev/null | head -n 1
ls /opt/alt/alt-nodejs*/root/usr/bin/node 2>/dev/null
ls /usr/bin/node 2>/dev/null
find /home/u402838766 -name 'node' -type f 2>/dev/null | head -n 20
find /opt -name 'node' -type f 2>/dev/null | head -n 20
cat ~/domains/portal.pharmegichealthcare.com/nodejs/package.json | head -n 5
"""
    stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    if err.strip():
        sys.stderr.buffer.write(err[-2000:].encode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
