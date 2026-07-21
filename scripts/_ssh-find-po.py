"""Find a missing PO file on Hostinger and report upload roots."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
REL = "Vibfast_Pigments/2026/PO/018_36__221VIBFAST.pdf"
NAME = "018_36__221VIBFAST.pdf"
ORIG = "018 36  221VIBFAST.pdf"

REMOTE = f"""
set +e
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
echo "=== env upload root ==="
grep -n CERTIFICATES_UPLOAD_ROOT .env .env.local 2>/dev/null || true
echo "=== expected paths ==="
for p in \\
  "{ROOT}/public/uploads/certificates/{REL}" \\
  "{ROOT}/.next/standalone/public/uploads/certificates/{REL}"
do
  if [ -f "$p" ]; then echo FOUND:$p; ls -la "$p"; else echo MISS:$p; fi
done
echo "=== find by name ==="
find "{ROOT}/public/uploads" "{ROOT}/.next/standalone/public/uploads" -iname '*221VIBFAST*' 2>/dev/null | head -50
find "{ROOT}/public/uploads" -iname '*018*36*' 2>/dev/null | head -50
echo "=== vibfast PO dir ==="
ls -la "{ROOT}/public/uploads/certificates/Vibfast_Pigments/2026/PO" 2>/dev/null || echo NO_PO_DIR
ls -la "{ROOT}/public/uploads/certificates/Vibfast_Pigments/2026" 2>/dev/null || echo NO_2026
echo "=== symlink ==="
ls -ld "{ROOT}/.next/standalone/public/uploads" 2>/dev/null || echo NO_STANDALONE_UPLOADS
echo "=== bo legacy ==="
find "{ROOT}/public/uploads/certificates/bo" -iname '*221VIBFAST*' 2>/dev/null | head -20
find "{ROOT}/public/uploads/certificates/bo" -iname '*Vibfast*' 2>/dev/null | head -20
"""


def main() -> int:
    password = os.environ.get("HOSTINGER_SSH_PASSWORD", "").strip()
    if not password:
        print("Set HOSTINGER_SSH_PASSWORD first.", file=sys.stderr)
        return 1
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
    _i, out, err = client.exec_command(REMOTE, timeout=120)
    sys.stdout.buffer.write(out.read())
    err_text = err.read()
    if err_text.strip():
        sys.stderr.buffer.write(err_text[-2000:])
    code = out.channel.recv_exit_status()
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
