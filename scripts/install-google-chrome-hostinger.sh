#!/usr/bin/env bash
# Run on Hostinger via SSH after: chmod +x scripts/install-google-chrome-hostinger.sh
set -euo pipefail

echo "==> Checking for Google Chrome..."
if command -v google-chrome-stable >/dev/null 2>&1; then
  google-chrome-stable --version
  echo "Chrome already installed at $(command -v google-chrome-stable)"
  exit 0
fi

echo "==> Process limit: $(ulimit -u 2>/dev/null || echo unknown)"
echo "==> Installing Google Chrome (requires sudo)..."

sudo apt-get update
sudo apt-get install -y wget gnupg ca-certificates
wget -q -O /tmp/google-chrome.gpg https://dl.google.com/linux/linux_signing_key.pub
sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg /tmp/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
  | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt-get update
sudo apt-get install -y google-chrome-stable

google-chrome-stable --version
echo ""
echo "SUCCESS. Add to hPanel env vars:"
echo "  PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable"
echo "Then redeploy the Node app."
