/**
 * 等 app 跑完 prisma migrate（表已建立）。worker 啟動時先跑此腳本。
 */
import { PrismaClient } from "@prisma/client";

const timeoutMs = Number(process.env.WAIT_SCHEMA_TIMEOUT_MS ?? "180000");
const intervalMs = Number(process.env.WAIT_SCHEMA_INTERVAL_MS ?? "2000");
const deadline = Date.now() + timeoutMs;

const prisma = new PrismaClient();

async function ready() {
  await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`;
}

async function main() {
  for (;;) {
    if (Date.now() > deadline) {
      console.error(
        `wait-for-schema: 逾時 ${timeoutMs}ms，_prisma_migrations 仍不存在（請查 app log 的 migrate deploy）`,
      );
      process.exit(1);
    }
    try {
      await ready();
      console.log("wait-for-schema: 資料表已就緒");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
