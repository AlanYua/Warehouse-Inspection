#!/bin/sh
set -eu

# standalone 或舊 layer 可能留下空的 prisma/migrations；每次啟動從備份還原
if [ ! -f /opt/prisma-migrations/20260511155840_init/migration.sql ]; then
  echo "FATAL: /opt/prisma-migrations 缺少 migration.sql（映像建置異常）"
  ls -laR /opt/prisma-migrations 2>/dev/null || true
  exit 1
fi

rm -rf prisma/migrations
mkdir -p prisma/migrations
cp -a /opt/prisma-migrations/. prisma/migrations/

if [ ! -f prisma/migrations/20260511155840_init/migration.sql ]; then
  echo "FATAL: 還原後仍找不到 prisma/migrations/20260511155840_init/migration.sql"
  ls -laR prisma/migrations 2>/dev/null || true
  exit 1
fi

node ./scripts/wait-for-db-tcp.mjs
node ./node_modules/prisma/build/index.js migrate deploy
exec node server.js
