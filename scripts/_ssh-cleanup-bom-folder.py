"""Verify live structure and remove BOM-prefixed A-One folder via bash only."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
UPLOAD_ROOT = (
    "/home/u402838766/domains/portal.pharmegichealthcare.com"
    "/nodejs/public/uploads/certificates"
)


def main() -> int:
    password = os.environ.get("HOSTINGER_SSH_PASSWORD", "").strip()
    if not password:
        print("Set HOSTINGER_SSH_PASSWORD", file=sys.stderr)
        return 1

    remote = f"""
set -e
ROOT="{UPLOAD_ROOT}"
cd "$ROOT"

# Remove BOM-prefixed A-One dir if empty of pdf/docx
for d in "$ROOT"/*A-One_Phthalo_Colors_Private_Limited; do
  [ -d "$d" ] || continue
  base=$(basename "$d")
  if [ "$base" = "A-One_Phthalo_Colors_Private_Limited" ]; then
    continue
  fi
  if find "$d" -type f \\( -iname '*.pdf' -o -iname '*.docx' \\) | grep -q .; then
    echo "SKIP_HAS_FILES=$base"
  else
    rm -rf "$d"
    echo "REMOVED_BAD=$base"
  fi
done

echo "GOOD_AONE=$( [ -d "$ROOT/A-One_Phthalo_Colors_Private_Limited/2026/PO" ] && echo yes || echo no )"
echo "COLOUR=$(ls -1 "$ROOT/COLOUR_INDIA/2026" 2>/dev/null | tr '\\n' ' ')"
echo "VIBFAST=$(ls -1 "$ROOT/Vibfast_Pigments/2026" 2>/dev/null | tr '\\n' ' ')"
echo "NAVPAD=$(ls -1 "$ROOT/NAVPAD_PIGMENTS_PRIVATE_LIMITED/2026" 2>/dev/null | tr '\\n' ' ')"
echo "CLIENT_COUNT=$(find "$ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l)"
echo "STRUCTURE_COUNT=$(find "$ROOT" -mindepth 3 -maxdepth 3 -type d \\( -name PO -o -name RC -o -name TCC \\) | wc -l)"
echo "SAMPLE_CLIENTS:"
ls -1 "$ROOT" | head -n 20
"""
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
    stdin, stdout, stderr = client.exec_command(remote, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    client.close()
    sys.stdout.buffer.write((out + ("\n" if not out.endswith("\n") else "")).encode("utf-8", errors="replace"))
    if err.strip():
        sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
