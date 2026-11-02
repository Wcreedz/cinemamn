#!/usr/bin/env bash
# VPS дээрх шинэчлэлт: хамаарал суулгаж, build хийж, PM2-оор дахин ачаалж, эрүүл мэндийг шалгана.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo ".env алга байна. .env.example-г хуулж бөглөнө үү." >&2; exit 1; }
mkdir -p logs
# 3100/4100 өөр апп ашиглаж байвал давхцуулахгүйгээр зогсоно.
for port in 3100 4100; do
  owner="$(ss -lntpH "sport = :$port" 2>/dev/null || true)"
  if [ -n "$owner" ] && ! pm2 jlist 2>/dev/null | grep -q '"name":"mongolflix-'; then
    echo "$port порт завгүй байна:" >&2; echo "$owner" >&2; exit 1
  fi
done
# Тестийн MongoDB binary-г production сервер дээр татахгүй.
MONGOMS_DISABLE_POSTINSTALL=1 npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4100/api/health >/dev/null; then
    echo "API эрүүл байна."; exit 0
  fi
  sleep 2
done
echo "API эрүүл болсонгүй. pm2 logs mongolflix-api-г шалгана уу." >&2
exit 1
