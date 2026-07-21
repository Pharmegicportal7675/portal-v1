"""Build standalone with DATABASE_URL and Passenger-restart."""
from __future__ import annotations

import os
import shlex
import sys
import time
from pathlib import Path

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
LOCAL = Path(__file__).resolve().parents[1]

PASSENGER_SERVER = (LOCAL / "server.js").read_text(encoding="utf-8")


def load_db_url() -> str:
    for name in (".env.local", ".env"):
        p = LOCAL / name
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    password = os.environ["HOSTINGER_SSH_PASSWORD"]
    db_url = load_db_url()
    if not db_url:
        print("DATABASE_URL missing", file=sys.stderr)
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

    sftp = client.open_sftp()
    with sftp.file(f"{ROOT}/server.js", "w") as f:
        f.write(PASSENGER_SERVER)
    sftp.close()

    def run(cmd: str, timeout: int = 900) -> str:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        code = out.channel.recv_exit_status()
        text = o + (("\nSTDERR:\n" + e) if e.strip() else "")
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        sys.stdout.buffer.write(f"\n[exit={code}]\n".encode())
        return text

    run("pkill -f next-server || true; pkill -f 'node server.js' || true", timeout=30)
    time.sleep(2)

    print("=== build with DATABASE_URL ===")
    run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd {shlex.quote(ROOT)}
export DATABASE_URL={shlex.quote(db_url)}
export NEXT_PUBLIC_APP_URL=https://portal.pharmegichealthcare.com
export NODE_ENV=production
export NODE_OPTIONS=--max-old-space-size=3072
npm run build
echo BUILD_EXIT=$?
test -f .next/standalone/server.js && echo STANDALONE=yes || echo STANDALONE=no
ls -la .next/standalone 2>&1 | head -n 20
"""
    )

    print("=== passenger restart ===")
    run(
        f"""
mkdir -p {shlex.quote(ROOT + "/tmp")}
echo restarted=$(date -Iseconds) > {shlex.quote(ROOT + "/tmp/restart.txt")}
sleep 5
tail -n 30 {shlex.quote(ROOT + "/console.log")}
for i in 1 2 3 4 5 6 7 8; do
  code=$(curl -s -m 2 -o /tmp/h.json -w "%{{http_code}}" http://127.0.0.1:3000/api/health || echo x)
  echo try_$i=$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
  sleep 2
done
ps aux | grep -E 'next-server|node ' | grep -v grep | head
""",
        timeout=120,
    )

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
