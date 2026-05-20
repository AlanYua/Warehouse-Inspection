#!/bin/sh
# 在 VPS 上備份 Postgres（需安裝 postgresql-client 或從 db 容器執行）
# 用法：./scripts/backup-db.sh
# Cron 範例（每天 03:00）：0 3 * * * cd /path/to/app && ./scripts/backup-db.sh

set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/warehouse_inspection-$STAMP.sql.gz"

mkdir -p "$OUT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

: "${DB_PASSWORD:?DB_PASSWORD not set in .env}"

COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"

docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  pg_dump -U warehouse -d warehouse_inspection --no-owner --no-acl \
  | gzip -9 > "$FILE"

echo "Backup: $FILE"
# 保留最近 14 份
ls -1t "$OUT_DIR"/warehouse_inspection-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
