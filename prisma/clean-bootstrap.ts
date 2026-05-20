/**
 * Remove bootstrap/demo data so you can "start fresh" locally.
 *
 * Deletes:
 * - ImportLog (匯入紀錄)
 * - Users (員工) except admin
 * - DocumentTypeOption (單據類型主檔/範本)
 * - CompanyPrintHeader (列印表頭)
 *
 * Does NOT delete:
 * - InspectionDoc / Product / Channel (use db:clean-current if you need)
 * - Department / ReturnShipment (assume could be real)
 *
 * Run:
 *   DB_CLEAN_CONFIRM=YES npm run db:clean-bootstrap
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DB_CLEAN_CONFIRM !== "YES") {
    throw new Error(
      [
        "[clean-bootstrap] refused: missing confirmation.",
        'Set env var: DB_CLEAN_CONFIRM=YES (PowerShell: $env:DB_CLEAN_CONFIRM="YES"; npm run db:clean-bootstrap)',
      ].join("\n"),
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const logs = await tx.importLog.deleteMany({});
    const docTypes = await tx.documentTypeOption.deleteMany({});
    const header = await tx.companyPrintHeader.deleteMany({});

    // Keep admin; remove others. Null-out doc references just in case.
    const nonAdminUsers = await tx.user.findMany({
      where: { username: { not: "admin" } },
      select: { id: true, username: true },
    });
    for (const u of nonAdminUsers) {
      await tx.inspectionDoc.updateMany({
        where: {
          OR: [{ inspectorId: u.id }, { pickerId: u.id }, { lockedByUserId: u.id }],
        },
        data: {
          inspectorId: null,
          pickerId: null,
          lockedByUserId: null,
          lockedAt: null,
        },
      });
    }
    const users = await tx.user.deleteMany({
      where: { username: { not: "admin" } },
    });

    return {
      logs,
      docTypes,
      header,
      users,
    };
  });

  console.log("[clean-bootstrap] done", {
    importLogsDeleted: result.logs.count,
    documentTypesDeleted: result.docTypes.count,
    companyPrintHeadersDeleted: result.header.count,
    usersDeleted: result.users.count,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

