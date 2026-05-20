/**
 * 僅清空 AuditLog（全系統操作紀錄）。
 *
 * Run:
 *   DB_CLEAN_CONFIRM=YES npm run db:clean-audit-logs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DB_CLEAN_CONFIRM !== "YES") {
    throw new Error(
      [
        "[clean-audit-logs] refused: missing confirmation.",
        'Set env var: DB_CLEAN_CONFIRM=YES (example: $env:DB_CLEAN_CONFIRM="YES"; npm run db:clean-audit-logs)',
      ].join("\n"),
    );
  }

  const r = await prisma.auditLog.deleteMany({});
  console.log("[clean-audit-logs] done", { auditLogsDeleted: r.count });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
