#!/usr/bin/env bash
# LibreOffice setup for TCC DOCX→PDF on Linux VPS. RC certificates use HTML→PDF (Puppeteer).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pharmegic PDF setup (LibreOffice for TCC)"
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
    echo "==> Restart your Node app manually (pm2 restart all or systemctl)."
  fi
}

echo "==> Installing LibreOffice Writer..."
sudo apt-get update
sudo apt-get install -y libreoffice-writer
soffice --version || libreoffice --version

restart_app

echo ""
echo "SUCCESS: LibreOffice installed for TCC PDF conversion."
echo "RC certificates use HTML → PDF (Puppeteer) — set PUPPETEER_EXECUTABLE_PATH on Hostinger VPS."
echo ""
echo "Verify: https://portal.pharmegichealthcare.com/api/health/pdf-converter"
