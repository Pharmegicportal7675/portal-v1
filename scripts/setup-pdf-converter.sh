#!/usr/bin/env bash
# Install DOCX→PDF support on Ubuntu/Debian VPS (RC & TCC certificate downloads).
set -euo pipefail

echo "==> Installing LibreOffice Writer..."
sudo apt-get update
sudo apt-get install -y libreoffice-writer
soffice --version || libreoffice --version

echo ""
echo "Done. Restart your portal app (e.g. pm2 restart all)."
