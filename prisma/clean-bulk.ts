/**
 * Remove bulk stress-test data created by prisma/seed-bulk.ts (prefix-based).
 *
 * Deletes (ONLY prefix-matched):
 * - InspectionDoc where documentNumber startsWith "BULK-" (and cascading DocumentLine)
 * - Channel where channelCode startsWith "BCH-"
 * - Product where productCode startsWith "BSKU-"
 * - Department where name startsWith "BULK-部門-"
 *
 * Run:
 *   DB_CLEAN_CONFIRM=YES npm run db:clean-bulk
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DB_CLEAN_CONFIRM !== "YES") {
    throw new Error(
      [
        "[clean-bulk] refused: missing confirmation.",
        'Set env var: DB_CLEAN_CONFIRM=YES (PowerShell: $env:DB_CLEAN_CONFIRM="YES"; npm run db:clean-bulk)',
      ].join("\n"),
    );
  }

  // 不用 interactive transaction：大量 deleteMany 常常 >5s，會踩到預設 transaction timeout。
  // 這裡按順序刪即可（doc -> channel -> product -> department），避免 FK 卡住。
  const docs = await prisma.inspectionDoc.deleteMany({
    where: { documentNumber: { startsWith: "BULK-" } },
  });
  const channels = await prisma.channel.deleteMany({
    where: { channelCode: { startsWith: "BCH-" } },
  });
  const products = await prisma.product.deleteMany({
    where: { productCode: { startsWith: "BSKU-" } },
  });
  const departments = await prisma.department.deleteMany({
    where: { name: { startsWith: "BULK-部門-" } },
  });

  console.log("[clean-bulk] done", {
    inspectionDocsDeleted: docs.count,
    channelsDeleted: channels.count,
    productsDeleted: products.count,
    departmentsDeleted: departments.count,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

