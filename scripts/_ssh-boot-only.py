"""Boot portal only and smoke-test localhost."""
from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = "147.93.17.79"
PORT = 65002
USER = "u402838766"
ROOT = "/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs"


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

    # Use get_transport channel with shorter commands
    def run(cmd: str, timeout: int = 60) -> str:
        _i, out, err = client.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", errors="replace")
        e = err.read().decode("utf-8", errors="replace")
        out.channel.recv_exit_status()
        return o + e

    sys.stdout.buffer.write(
        run(
            f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
echo HAS_NEXT=$(test -f node_modules/next/dist/bin/next && echo yes || echo no)
echo HAS_BUILD=$(test -f .next/BUILD_ID && echo yes || echo no)
wc -c server.js
head -n 5 server.js
"""
        ).encode("utf-8", errors="replace")
    )

    # Kill and start as separate steps
    run("pkill -f next-server || true; pkill -f 'node server.js' || true", timeout=20)
    time.sleep(2)

    # Start detached using setsid
    boot = run(
        f"""
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
cd "{ROOT}"
setsid nohup node server.js -p 3000 >/tmp/portal-boot.log 2>&1 < /dev/null &
echo PID=$!
""",
        timeout=20,
    )
    sys.stdout.buffer.write(boot.encode("utf-8", errors="replace"))
    time.sleep(6)

    status = run(
        """
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
echo "=== log ==="
tail -n 40 /tmp/portal-boot.log 2>/dev/null
echo "=== ps ==="
ps aux | grep -E 'next-server|server.js' | grep -v grep | head
echo "=== curl ==="
curl -s -m 5 -o /tmp/health.json -w "CODE=%{http_code}\n" http://127.0.0.1:3000/api/health || echo CODE=fail
cat /tmp/health.json 2>/dev/null
echo
""",
        timeout=40,
    )
    sys.stdout.buffer.write(status.encode("utf-8", errors="replace"))
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
