/**
 * Quick DB connectivity + table counts (no auth).
 *
 * Run:
 *   npm run db:check
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$queryRaw`SELECT 1`;

  const [
    users,
    departments,
    docTypes,
    channels,
    products,
    docs,
    lines,
    returns,
    logs,
    headers,
    sync,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.department.count(),
    prisma.documentTypeOption.count(),
    prisma.channel.count(),
    prisma.product.count(),
    prisma.inspectionDoc.count(),
    prisma.documentLine.count(),
    prisma.returnShipment.count(),
    prisma.importLog.count(),
    prisma.companyPrintHeader.count(),
    prisma.syncConfig.count(),
  ]);

  console.log("[db:check] ok", {
    users,
    departments,
    documentTypeOptions: docTypes,
    channels,
    products,
    inspectionDocs: docs,
    documentLines: lines,
    returnShipments: returns,
    importLogs: logs,
    companyPrintHeaders: headers,
    syncConfigs: sync,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[db:check] failed", e);
    await prisma.$disconnect();
    process.exit(1);
  });

