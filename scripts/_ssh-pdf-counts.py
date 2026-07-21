"""Quick PDF counts on live (bash-only, no PowerShell interpolation)."""
from __future__ import annotations

import os
import sys

import paramiko

REMOTE = r"""
CERT=/home/u402838766/domains/portal.pharmegichealthcare.com/nodejs/public/uploads/certificates
echo PDF_TOTAL=$(find "$CERT" -type f -iname '*.pdf' | wc -l)
echo COLOUR_PDFS=$(find "$CERT/COLOUR_INDIA" -type f -iname '*.pdf' 2>/dev/null | wc -l)
echo NAVPAD_PDFS=$(find "$CERT/NAVPAD_PIGMENTS_PRIVATE_LIMITED" -type f -iname '*.pdf' 2>/dev/null | wc -l)
echo VIBFAST_PDFS=$(find "$CERT/Vibfast_Pigments" -type f -iname '*.pdf' 2>/dev/null | wc -l)
echo STRUCTURE=$(find "$CERT" -mindepth 3 -maxdepth 3 -type d \( -name PO -o -name RC -o -name TCC \) | wc -l)
grep -c linkRuntimeUploads /home/u402838766/domains/portal.pharmegichealthcare.com/nodejs/server.js
"""


def main() -> int:
    password = os.environ["HOSTINGER_SSH_PASSWORD"]
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        "147.93.17.79",
        port=65002,
        username="u402838766",
        password=password,
        timeout=45,
        allow_agent=False,
        look_for_keys=False,
    )
    _i, out, err = client.exec_command(REMOTE, timeout=90)
    sys.stdout.buffer.write(out.read())
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
