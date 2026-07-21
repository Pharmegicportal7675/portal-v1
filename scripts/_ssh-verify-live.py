"""Verify Hostinger has latest code and folder structure."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"

REMOTE = f"""
set +e
cd "{ROOT}"
echo "=== git ==="
git rev-parse --short HEAD 2>/dev/null || echo no-git
git log -1 --oneline 2>/dev/null || true
echo "=== server.js markers ==="
grep -c linkRuntimeUploads server.js 2>/dev/null
grep -c CERTIFICATES_UPLOAD_ROOT server.js 2>/dev/null
echo "=== ensure script ==="
test -f scripts/ensure-live-folder-structure.mjs && echo ensure-script=yes || echo ensure-script=no
echo "=== package script ==="
grep -c ensure:live-folders package.json 2>/dev/null
CERT="{ROOT}/public/uploads/certificates"
echo "=== folders ==="
echo -n "STRUCTURE="
find "$CERT" -mindepth 3 -maxdepth 3 -type d \\( -name PO -o -name RC -o -name TCC \\) 2>/dev/null | wc -l
echo -n "COLOUR="
ls -1 "$CERT/COLOUR_INDIA/2026" 2>/dev/null | tr '\\n' ' '
echo
echo -n "VIBFAST="
ls -1 "$CERT/Vibfast_Pigments/2026" 2>/dev/null | tr '\\n' ' '
echo
echo -n "NAVPAD="
ls -1 "$CERT/NAVPAD_PIGMENTS_PRIVATE_LIMITED/2026" 2>/dev/null | tr '\\n' ' '
echo
"""


def main() -> int:
    password = os.environ.get("HOSTINGER_SSH_PASSWORD", "").strip()
    if not password:
        print("Set HOSTINGER_SSH_PASSWORD", file=sys.stderr)
        return 1
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
    _stdin, stdout, stderr = client.exec_command(REMOTE, timeout=90)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    client.close()
    sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    if err.strip():
        sys.stderr.buffer.write(err[-1500:].encode("utf-8", errors="replace"))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
