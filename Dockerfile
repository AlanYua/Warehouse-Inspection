FROM node:22-alpine AS base

# ------- deps -------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# ------- build -------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# public/ 可能未進 git；確保目錄存在，避免 runner COPY /app/public 失敗
RUN mkdir -p public
RUN npx prisma generate && npm run build \
 && test -f prisma/migrations/20260511155840_init/migration.sql

# ------- runner -------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache su-exec \
 && addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
# builder 已 mkdir -p public；靜態檔亦會在 standalone/public
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
# 與 /app 分開存放，避免 standalone 覆蓋；啟動時 entrypoint 再 cp 到 prisma/migrations
COPY --from=builder /app/prisma/migrations /opt/prisma-migrations
RUN test -f /opt/prisma-migrations/20260511155840_init/migration.sql
COPY --from=deps    /app/node_modules/.prisma ./node_modules/.prisma
# migrate deploy 需要完整 Prisma CLI（含 @prisma/engines 等）
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

COPY scripts/wait-for-db-tcp.mjs ./scripts/wait-for-db-tcp.mjs
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# entrypoint 以 root 還原 migrations，再以 su-exec 降權跑 app
USER root
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD su-exec nextjs node -e "fetch('http://127.0.0.1:3000/api/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/usr/local/bin/docker-entrypoint.sh"]

# ------- worker（背景排程；需 tsx 跑 TypeScript） -------
FROM base AS worker
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./
COPY src ./src/
COPY scripts/worker.ts ./scripts/worker.ts
COPY scripts/wait-for-db-tcp.mjs ./scripts/wait-for-db-tcp.mjs
COPY scripts/wait-for-schema.mjs ./scripts/wait-for-schema.mjs
# tsx 在 devDependencies；NODE_ENV=production 時預設 npm ci 不會裝
RUN npm ci --include=dev \
 && node ./node_modules/prisma/build/index.js generate

ENV NODE_ENV=production

CMD ["sh", "-c", "node ./scripts/wait-for-db-tcp.mjs && node ./scripts/wait-for-schema.mjs && node ./node_modules/tsx/dist/cli.mjs scripts/worker.ts"]
