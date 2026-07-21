"""Recover broken .next backup if any, else full npm ci + build."""
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

    def run(cmd: str, timeout: int = 900) -> str:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        code = out.channel.recv_exit_status()
        text = o + (("\nSTDERR_TAIL:\n" + e[-4000:]) if e.strip() else "")
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        sys.stdout.buffer.write(f"\n[exit={code}]\n".encode())
        return text

    print("=== check backups ===")
    run(
        f"""
ls -la "{ROOT}" | grep next
test -f "{ROOT}/.next.bak-broken/BUILD_ID" && echo BAK=$(cat "{ROOT}/.next.bak-broken/BUILD_ID") || echo NO_BAK
find "{ROOT}" -maxdepth 2 -name BUILD_ID 2>/dev/null
du -sh "{ROOT}/.next"* 2>/dev/null
"""
    )

    # Restore bak if it has BUILD_ID
    run(
        f"""
cd "{ROOT}"
if [ -f .next.bak-broken/BUILD_ID ]; then
  rm -rf .next
  mv .next.bak-broken .next
  echo RESTORED_FROM_BAK=$(cat .next/BUILD_ID)
else
  echo NO_BAK_TO_RESTORE
fi
"""
    )

    # Full install + build
    print("=== npm ci (with devDeps) + build ===")
    run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd {shlex.quote(ROOT)}
export DATABASE_URL={shlex.quote(db_url)}
export NEXT_PUBLIC_APP_URL=https://portal.pharmegichealthcare.com
export NODE_ENV=production
export NODE_OPTIONS=--max-old-space-size=3072
npm ci
npm run build
echo BUILD_EXIT=$?
test -f .next/BUILD_ID && echo BUILD_ID=$(cat .next/BUILD_ID) || echo NO_BUILD
test -f .next/standalone/server.js && echo STANDALONE=yes || echo STANDALONE=no
""",
        timeout=900,
    )

    print("=== restart ===")
    run(
        f"""
cd "{ROOT}"
mkdir -p tmp
echo restart=$(date -Iseconds) > tmp/restart.txt
sleep 10
tail -n 40 console.log
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  code=$(curl -s -m 3 -o /tmp/h.json -w "%{{http_code}}" http://127.0.0.1:3000/api/health || echo x)
  echo try_$i=$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
  sleep 2
done
""",
        timeout=120,
    )
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
