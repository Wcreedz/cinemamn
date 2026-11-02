#!/usr/bin/env bash
# Нөөцөөс сэргээх: ./restore.sh /var/backups/mongolflix/mongo-XXXX.archive.gz
# Анхаар: одоогийн баазыг сольж бичнэ.
set -euo pipefail
cd "$(dirname "$0")/../.."
MONGODB_URI="$(grep -E '^MONGODB_URI=' .env | cut -d= -f2-)"
FILE="${1:?Нөөц файлын зам өгнө үү}"
[ -f "$FILE" ] || { echo "Файл олдсонгүй: $FILE" >&2; exit 1; }
gzip -t "$FILE"
read -r -p "Баазыг '$FILE' файлаар СОЛИХ уу? 'yes' гэж бичнэ үү: " ok
[ "$ok" = "yes" ] || { echo "Цуцлагдлаа."; exit 1; }
pm2 stop mongolflix-api mongolflix-worker
mongorestore --quiet --uri="$MONGODB_URI" --archive --gzip --drop < "$FILE"
pm2 start mongolflix-api mongolflix-worker
echo "Сэргээлээ."
