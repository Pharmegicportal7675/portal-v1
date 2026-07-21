"""Finish restore: verify next bin, npm ci if needed, boot portal."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"


def safe_print(text: str) -> None:
    sys.stdout.buffer.write((text or "").encode("utf-8", errors="replace"))
    if not (text or "").endswith("\n"):
        sys.stdout.buffer.write(b"\n")
    sys.stdout.buffer.flush()


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

    def run(cmd: str, timeout: int = 600) -> tuple[str, int]:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        code = out.channel.recv_exit_status()
        return (o + (("\nSTDERR:\n" + e) if e.strip() else "")), code

    o, _ = run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
echo "=== next package ==="
ls -la node_modules/next/dist 2>&1 | head -n 40
find node_modules/next -name 'next' -type f 2>/dev/null | head -n 20
test -f node_modules/next/dist/bin/next && echo HAS_BIN=yes || echo HAS_BIN=no
"""
    )
    safe_print(o)

    if "HAS_BIN=no" in o:
        safe_print("=== npm ci ===")
        o2, code2 = run(
            f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
npm ci --omit=dev
echo NPM_CI_EXIT=$?
test -f node_modules/next/dist/bin/next && echo HAS_BIN=yes || echo HAS_BIN=no
ls -la node_modules/next/dist/bin 2>&1 | head
""",
            timeout=600,
        )
        safe_print(o2[-5000:])
        if "HAS_BIN=no" in o2:
            safe_print("=== npm install next ===")
            o3, _ = run(
                f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
npm install next@16.2.6 --omit=dev --no-save
test -f node_modules/next/dist/bin/next && echo HAS_BIN=yes || echo HAS_BIN=no
ls -la node_modules/next/dist/bin 2>&1 | head
""",
                timeout=300,
            )
            safe_print(o3[-3000:])

    safe_print("=== boot ===")
    o4, _ = run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
pkill -f "next-server" 2>/dev/null || true
pkill -f "{ROOT}/server.js" 2>/dev/null || true
sleep 2
nohup node server.js -p 3000 > /tmp/portal-boot.log 2>&1 &
echo BOOT_PID=$!
sleep 5
cat /tmp/portal-boot.log | tail -n 60
ps aux | grep -E 'next-server|server.js' | grep -v grep | head
curl -s -o /dev/null -w "LOCAL_HEALTH=%{{http_code}}\\n" http://127.0.0.1:3000/api/health || echo LOCAL_HEALTH=fail
curl -s http://127.0.0.1:3000/api/health || true
""",
        timeout=120,
    )
    safe_print(o4)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
