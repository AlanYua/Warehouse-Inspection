#!/bin/sh
set -eu

if [ ! -f /opt/prisma-migrations/20260511155840_init/migration.sql ]; then
  echo "FATAL: /opt/prisma-migrations 缺少 migration.sql（映像建置異常）"
  ls -laR /opt/prisma-migrations 2>/dev/null || true
  exit 1
fi

# 還原 migrations（用 cat 寫入真實檔案；避免 cp 到 volume/overlay 後 Prisma 仍 P3015）
rm -rf prisma/migrations
mkdir -p prisma/migrations
for d in /opt/prisma-migrations/*/; do
  name=$(basename "$d")
  [ "$name" = "*" ] && continue
  mkdir -p "prisma/migrations/$name"
  if [ -f "$d/migration.sql" ]; then
    cat "$d/migration.sql" > "prisma/migrations/$name/migration.sql"
  fi
done
if [ -f /opt/prisma-migrations/migration_lock.toml ]; then
  cat /opt/prisma-migrations/migration_lock.toml > prisma/migrations/migration_lock.toml
fi
chown -R nextjs:nodejs prisma/migrations

bytes=$(wc -c < prisma/migrations/20260511155840_init/migration.sql 2>/dev/null || echo 0)
if [ "$bytes" -lt 100 ]; then
  echo "FATAL: migration.sql 太小 (${bytes} bytes)，還原失敗"
  ls -laR prisma/migrations 2>/dev/null || true
  exit 1
fi

exec su-exec nextjs sh -c '
  node ./scripts/wait-for-db-tcp.mjs
  node ./node_modules/prisma/build/index.js migrate deploy
  exec node server.js
'
