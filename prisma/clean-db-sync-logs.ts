/**
 * 刪除 ImportLog 中 source = DB_SYNC 的紀錄（背景 worker 寫入，匯入紀錄頁不顯示）。
 *
 * Run: npm run db:clean-db-sync-logs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const bySource = await prisma.importLog.groupBy({
    by: ["source"],
    _count: true,
  });
  if (bySource.length > 0) {
    console.log("[clean-db-sync-logs] 刪除前各來源筆數:", bySource);
  }

  const r = await prisma.importLog.deleteMany({
    where: { source: "DB_SYNC" },
  });
  console.log(`[clean-db-sync-logs] 已刪除 ${r.count} 筆 DB_SYNC 匯入紀錄`);

  const remaining = await prisma.importLog.count();
  console.log(`[clean-db-sync-logs] 剩餘匯入紀錄 ${remaining} 筆`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
