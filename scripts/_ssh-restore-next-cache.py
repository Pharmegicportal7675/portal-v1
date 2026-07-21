"""Restore .next from Hostinger last-source cache, then restart."""
from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"
LAST = "/home/u402838766/domains/portal.pharmegichealthcare.com/public_html/.builds/last-source"


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

    def run(cmd: str, timeout: int = 300) -> str:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        out.channel.recv_exit_status()
        text = o + (("\n" + e) if e.strip() else "")
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        if not text.endswith("\n"):
            sys.stdout.buffer.write(b"\n")
        return text

    print("=== inspect last-source ===")
    run(
        f"""
ls -la "{LAST}" | head -n 40
test -f "{LAST}/.next/BUILD_ID" && echo LAST_BUILD=$(cat "{LAST}/.next/BUILD_ID") || echo NO_LAST_BUILD
test -f "{LAST}/.next/standalone/server.js" && echo LAST_STANDALONE=yes || echo LAST_STANDALONE=no
du -sh "{LAST}/.next" 2>/dev/null
ls -la "{LAST}/.next" 2>&1 | head -n 30
"""
    )

    print("=== restore .next from last-source ===")
    run(
        f"""
set -e
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
if [ -f "{LAST}/.next/BUILD_ID" ]; then
  rm -rf .next.bak-broken
  if [ -d .next ]; then mv .next .next.bak-broken; fi
  cp -a "{LAST}/.next" .next
  echo RESTORED_BUILD=$(cat .next/BUILD_ID)
  test -f .next/standalone/server.js && echo STANDALONE=yes || echo STANDALONE=no
else
  echo NO_CACHE_BUILD
  exit 2
fi
mkdir -p tmp
echo restart=$(date -Iseconds) > tmp/restart.txt
sleep 8
tail -n 30 console.log
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  code=$(curl -s -m 3 -o /tmp/h.json -w "%{{http_code}}" http://127.0.0.1:3000/api/health || echo x)
  echo try_$i=$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
  sleep 2
done
"""
    )
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
