"""Inspect live uploads paths and re-ensure Client/Year/PO|RC|TCC folders."""
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
REMOTE_ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
LOCAL_ROOT = Path(__file__).resolve().parents[1]


def load_database_url() -> str:
    for name in (".env.local", ".env"):
        env_path = LOCAL_ROOT / name
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    password = os.environ.get("HOSTINGER_SSH_PASSWORD", "").strip()
    db_url = load_database_url()
    if not password or not db_url:
        print("Need HOSTINGER_SSH_PASSWORD and DATABASE_URL", file=sys.stderr)
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

    inspect = f"""
set +e
ROOT="{REMOTE_ROOT}"
echo "=== trees ==="
ls -la "$ROOT/public/uploads" 2>/dev/null | head
ls -la "$ROOT/public/uploads/certificates" 2>/dev/null | head -n 25
echo "=== standalone uploads ==="
ls -la "$ROOT/.next/standalone/public/uploads" 2>/dev/null | head
ls -la "$ROOT/.next/standalone/public/uploads/certificates" 2>/dev/null | head -n 15
echo "=== symlink? ==="
ls -ld "$ROOT/.next/standalone/public/uploads" 2>/dev/null
echo "=== server.js head ==="
head -n 5 "$ROOT/server.js"
grep -n "linkRuntimeUploads\\|function startStandalone\\|CERTIFICATES" "$ROOT/server.js" | head -n 20
echo "=== file counts ==="
CERT="$ROOT/public/uploads/certificates"
echo -n "client_dirs="
find "$CERT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l
echo -n "pdf_count="
find "$CERT" -type f -iname '*.pdf' 2>/dev/null | wc -l
echo -n "colour_exists="
test -d "$CERT/COLOUR_INDIA" && echo yes || echo no
ls -la "$CERT/COLOUR_INDIA" 2>/dev/null | head
"""
    _i, stdout, stderr = client.exec_command(inspect, timeout=90)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err[-2000:], file=sys.stderr)

    # Upload ensure script + run
    sftp = client.open_sftp()
    sftp.put(
        str(LOCAL_ROOT / "scripts" / "ensure-live-folder-structure.mjs"),
        f"{REMOTE_ROOT}/scripts/ensure-live-folder-structure.mjs",
    )
    # Also push updated server.js so runtime writes go to public/uploads
    sftp.put(str(LOCAL_ROOT / "server.js"), f"{REMOTE_ROOT}/server.js")
    sftp.close()
    print("Uploaded ensure script + server.js")

    ensure = f"""
set -e
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd {shlex.quote(REMOTE_ROOT)}
export CERTIFICATES_UPLOAD_ROOT={shlex.quote(REMOTE_ROOT + "/public/uploads/certificates")}
export DATABASE_URL={shlex.quote(db_url)}
node scripts/ensure-live-folder-structure.mjs
echo ENSURE_OK
# quick verify
CERT="{REMOTE_ROOT}/public/uploads/certificates"
echo -n STRUCTURE=
find "$CERT" -mindepth 3 -maxdepth 3 -type d \\( -name PO -o -name RC -o -name TCC \\) | wc -l
echo -n COLOUR=
ls -1 "$CERT/COLOUR_INDIA/2026" 2>/dev/null | tr '\\n' ' '
echo
echo -n VIBFAST=
ls -1 "$CERT/Vibfast_Pigments/2026" 2>/dev/null | tr '\\n' ' '
echo
"""
    _i, stdout, stderr = client.exec_command(ensure, timeout=180)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if err.strip():
        print(err[-2000:], file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
