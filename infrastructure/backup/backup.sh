#!/usr/bin/env bash
# MongoDB-н өдөр тутмын нөөцлөлт. Cron: 0 3 * * * /opt/mongolflix/infrastructure/backup/backup.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
MONGODB_URI="$(grep -E '^MONGODB_URI=' .env | cut -d= -f2-)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mongolflix}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/mongo-$(date +%Y%m%d-%H%M%S).archive.gz"
mongodump --quiet --uri="$MONGODB_URI" --archive --gzip > "$FILE.tmp"
# Хоосон эсвэл эвдэрсэн dump-ыг хүчинтэй нөөц гэж үзэхгүй.
[ -s "$FILE.tmp" ] && gzip -t "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$BACKUP_DIR" -name 'mongo-*.archive.gz' -mtime "+$KEEP_DAYS" -delete
echo "Нөөцлөв: $FILE"
