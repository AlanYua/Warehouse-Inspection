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
RUN npx prisma generate && npm run build \
 && test -f prisma/migrations/20260511155840_init/migration.sql

# ------- runner -------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
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
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R nextjs:nodejs /app /opt/prisma-migrations

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/usr/local/bin/docker-entrypoint.sh"]

# ------- worker（背景排程，與 app 共用同一映像建置鏈） -------
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./
COPY src ./src/
COPY scripts/worker.ts ./scripts/worker.ts
COPY scripts/wait-for-db-tcp.mjs ./scripts/wait-for-db-tcp.mjs
RUN npm ci && node ./node_modules/prisma/build/index.js generate

CMD ["sh", "-c", "node ./scripts/wait-for-db-tcp.mjs && node ./node_modules/tsx/dist/cli.mjs scripts/worker.ts"]
