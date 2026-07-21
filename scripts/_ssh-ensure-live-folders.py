"""
Create live certificate folders over SSH. Does not delete anything.
Usage (PowerShell):
  $env:HOSTINGER_SSH_PASSWORD='...'; python scripts/_ssh-ensure-live-folders.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
FOLDERS_FILE = ROOT / "scripts" / "_live-folders-to-create.txt"
UPLOAD_ROOT = (
    "/home/u402838766/domains/portal.pharmegichealthcare.com"
    "/nodejs/public/uploads/certificates"
)

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"


def main() -> int:
    password = os.environ.get("HOSTINGER_SSH_PASSWORD", "").strip()
    if not password:
        print("Set HOSTINGER_SSH_PASSWORD env var.", file=sys.stderr)
        return 1

    folders = [
        line.strip().replace("\\", "/").lstrip("\ufeff")
        for line in FOLDERS_FILE.read_text(encoding="utf-8-sig").splitlines()
        if line.strip()
    ]
    if not folders:
        print("No folders listed in", FOLDERS_FILE)
        return 1

    # One remote bash script: mkdir -p for every path, then count.
    lines = ["set -e", f'ROOT="{UPLOAD_ROOT}"', 'mkdir -p "$ROOT"', "CREATED=0", "EXISTING=0"]
    for rel in folders:
        # quote safely for bash single quotes
        safe = rel.replace("'", "'\\''")
        lines.append(f'P="$ROOT/{safe}"')
        lines.append('if [ -d "$P" ]; then EXISTING=$((EXISTING+1)); else mkdir -p "$P"; CREATED=$((CREATED+1)); fi')
    lines.append('echo "UPLOAD_ROOT=$ROOT"')
    lines.append('echo "CREATED=$CREATED"')
    lines.append('echo "EXISTING=$EXISTING"')
    lines.append('echo "TOTAL_DIRS=$(find "$ROOT" -mindepth 3 -maxdepth 3 -type d | wc -l)"')
    lines.append('echo "--- sample tree ---"')
    lines.append('ls -1 "$ROOT" | head -n 30')
    lines.append('echo "..."')
    lines.append('ls -1 "$ROOT/COLOUR_INDIA" 2>/dev/null || true')
    lines.append('ls -1 "$ROOT/COLOUR_INDIA/2026" 2>/dev/null || true')
    lines.append('ls -1 "$ROOT/Vibfast_Pigments/2026" 2>/dev/null || true')
    remote = "\n".join(lines)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {USER}@{HOST}:{PORT} ...")
    client.connect(
        hostname=HOST,
        port=PORT,
        username=USER,
        password=password,
        timeout=45,
        allow_agent=False,
        look_for_keys=False,
    )
    print(f"Ensuring {len(folders)} folders under {UPLOAD_ROOT} ...")
    stdin, stdout, stderr = client.exec_command("bash -s", timeout=180)
    stdin.write(remote)
    stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    client.close()

    def safe_print(text: str, stream=sys.stdout) -> None:
        data = (text or "").encode(stream.encoding or "utf-8", errors="replace")
        stream.buffer.write(data)
        if not text.endswith("\n"):
            stream.buffer.write(b"\n")
        stream.buffer.flush()

    if out.strip():
        safe_print(out)
    if err.strip():
        safe_print(err, sys.stderr)
    if code != 0:
        print(f"Remote exit code: {code}", file=sys.stderr)
        return code
    print("Live folder structure ensure completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
