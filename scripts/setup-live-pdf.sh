#!/usr/bin/env bash
# Hostinger/VPS: PDF uses puppeteer-core + @sparticuz/chromium-min only (no LibreOffice).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pharmegic live PDF setup (Puppeteer)"
echo "    Project: $ROOT"
echo ""

restart_app() {
  if command -v pm2 >/dev/null 2>&1; then
    echo "==> Restarting app (pm2)..."
    pm2 restart all || pm2 restart pharmegic-portal || pm2 restart 0 || true
  elif systemctl is-active --quiet pharmegic-portal 2>/dev/null; then
    echo "==> Restarting app (systemctl)..."
    sudo systemctl restart pharmegic-portal
  else
    echo "==> Restart your Node app manually after env changes."
  fi
}

echo "==> Required env (Hostinger hPanel):"
echo "    NEXT_PUBLIC_APP_URL=https://portal.pharmegichealthcare.com"
echo "    Node.js 20.x or 22.x"
echo "    Remove PUPPETEER_EXECUTABLE_PATH unless Chrome is installed"
echo ""

restart_app

echo ""
echo "SUCCESS: PDF engine is puppeteer-core + @sparticuz/chromium-min."
echo "Verify: https://portal.pharmegichealthcare.com/api/health/pdf-converter"
