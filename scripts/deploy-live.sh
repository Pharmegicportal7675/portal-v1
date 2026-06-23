#!/usr/bin/env bash
# Full live deploy: pull code, build, start PDF converter, restart app.
# Run on VPS:  bash scripts/deploy-live.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pharmegic live deploy"
echo "    $ROOT"
echo ""

echo "==> git pull..."
git pull origin main

echo "==> npm ci..."
npm ci

echo "==> npm run build..."
npm run build

echo "==> PDF converter setup..."
bash scripts/setup-live-pdf.sh

echo ""
echo "==> Deploy complete."
echo "    Health: https://portal.pharmegichealthcare.com/api/health/pdf-converter"
echo "    RC page: https://portal.pharmegichealthcare.com/admin/rc-certificates"
