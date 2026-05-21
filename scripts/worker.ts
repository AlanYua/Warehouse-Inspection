/**
 * 背景排程：依 SYNC_CRON_EXPRESSION 定時從 noopAdapter 拉資料並 applyExternalRows，寫入 importLog。
 * 啟動：npm run worker（需資料庫環境變數；ERP_DB_URL 未設時仍跑但 0 筆）。
 */
import "dotenv/config";
import cron from "node-cron";
import { DocumentSource, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { noopAdapter } from "../src/lib/sync/noopAdapter";
import { applyExternalRows } from "../src/lib/sync/applyExternalRows";

const expr = process.env.SYNC_CRON_EXPRESSION || "0 * * * *";

function isMissingTable(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2021"
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist|不存在/.test(msg);
}

async function schemaReady(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

async function runDbPull() {
  if (!(await schemaReady())) {
    console.warn(
      "[worker] 資料表尚未建立（請確認 app 已跑 migrate deploy），略過本次 sync",
    );
    return;
  }

  try {
    const rows = await noopAdapter.pullFromDatabase();
    const { created, updated, errors } = await applyExternalRows(
      rows,
      DocumentSource.DB_SYNC,
    );
    await prisma.importLog.create({
      data: {
        source: "DB_SYNC",
        successCount: created + updated,
        errorCount: errors.length,
        message:
          errors.length > 0
            ? errors.slice(0, 30).join("\n")
            : `created ${created} updated ${updated}`,
      },
    });
    console.log(
      new Date().toISOString(),
      "db sync",
      { created, updated, err: errors.length },
    );
  } catch (e) {
    console.error(e);
    if (isMissingTable(e)) return;
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await prisma.importLog.create({
        data: {
          source: "DB_SYNC",
          successCount: 0,
          errorCount: 1,
          message: msg,
        },
      });
    } catch (logErr) {
      console.error("importLog write skipped:", logErr);
    }
  }
}

if (!process.env.ERP_DB_URL) {
  console.log("ERP_DB_URL 未設定，排程仍會執行 noop（0 筆）");
}

cron.schedule(expr, () => {
  void runDbPull().catch((e) => console.error("[worker] cron:", e));
});

console.log("sync worker cron:", expr);
void runDbPull().catch((e) => console.error("[worker] startup:", e));
