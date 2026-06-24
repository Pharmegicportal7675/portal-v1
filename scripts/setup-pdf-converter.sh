#!/usr/bin/env bash
# PDF on this portal uses puppeteer-core + @sparticuz/chromium-min (HTML → PDF).
# No LibreOffice required. Optional: install system Chrome for faster PDFs on VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pharmegic PDF setup (Puppeteer / Chromium)"
echo "    Project: $ROOT"
echo ""
echo "RC and TCC certificates use HTML → PDF via puppeteer-core + @sparticuz/chromium-min."
echo "Ensure Hostinger Node.js is 20.x or 22.x and NEXT_PUBLIC_APP_URL is set."
echo ""
echo "Optional — install Google Chrome on VPS for faster PDFs:"
echo "  See deployment.md → RC HTML Certificate PDF (Puppeteer)"
echo ""
echo "Verify after deploy:"
echo "  /api/health/pdf-converter"
echo "  /api/health/pdf-worker"
