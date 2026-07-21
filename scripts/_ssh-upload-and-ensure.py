"""Upload ensure script to Hostinger and run folder ensure with Node 22."""
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
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if db_url:
        return db_url
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
    if not password:
        print("Set HOSTINGER_SSH_PASSWORD", file=sys.stderr)
        return 1

    db_url = load_database_url()
    if not db_url:
        print("DATABASE_URL missing locally.", file=sys.stderr)
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

    sftp = client.open_sftp()
    local = LOCAL_ROOT / "scripts" / "ensure-live-folder-structure.mjs"
    remote = f"{REMOTE_ROOT}/scripts/ensure-live-folder-structure.mjs"
    sftp.put(str(local), remote)
    sftp.close()
    print(f"Uploaded {remote}")

    cmds = f"""
set -e
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
cd {shlex.quote(REMOTE_ROOT)}
export CERTIFICATES_UPLOAD_ROOT={shlex.quote(REMOTE_ROOT + "/public/uploads/certificates")}
export DATABASE_URL={shlex.quote(db_url)}
node -v
node scripts/ensure-live-folder-structure.mjs
echo ENSURE_OK
"""
    stdin, stdout, stderr = client.exec_command(cmds, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    client.close()

    sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    if err.strip():
        sys.stderr.buffer.write(err[-4000:].encode("utf-8", errors="replace"))
    return 0 if code == 0 else code


if __name__ == "__main__":
    raise SystemExit(main())
