/**
 * DANGEROUS: Wipe almost all data (keep admin user only).
 *
 * Deletes:
 * - ReturnShipment
 * - InspectionDoc (and cascading DocumentLine)
 * - Channel
 * - Product
 * - ImportLog
 * - SyncConfig
 * - DocumentTypeOption
 * - CompanyPrintHeader
 * - Department
 * - Users except admin
 * - AuditLog（操作紀錄）
 *
 * Run:
 *   DB_CLEAN_CONFIRM=YES npm run db:clean-all
 */
import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DB_CLEAN_CONFIRM !== "YES") {
    throw new Error(
      [
        "[clean-all] refused: missing confirmation.",
        'Set env var: DB_CLEAN_CONFIRM=YES (PowerShell: $env:DB_CLEAN_CONFIRM="YES"; npm run db:clean-all)',
      ].join("\n"),
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Comments are not FK-cascaded (targetId is polymorphic), so we must delete them explicitly.
    const comments = await tx.comment.deleteMany({});
    const auditLogs = await tx.auditLog.deleteMany({});

    const returns = await tx.returnShipment.deleteMany({});

    // Delete docs first; lines are onDelete: Cascade.
    const docs = await tx.inspectionDoc.deleteMany({});

    // Master data depending on department
    const channels = await tx.channel.deleteMany({});
    const products = await tx.product.deleteMany({});

    // Logs / configs
    const logs = await tx.importLog.deleteMany({});
    const sync = await tx.syncConfig.deleteMany({});
    const docTypes = await tx.documentTypeOption.deleteMany({});
    const header = await tx.companyPrintHeader.deleteMany({});

    // Settings masters
    const departments = await tx.department.deleteMany({});

    // Users: keep admin only
    const users = await tx.user.deleteMany({ where: { username: { not: "admin" } } });

    return {
      comments,
      auditLogs,
      returns,
      docs,
      channels,
      products,
      logs,
      sync,
      docTypes,
      header,
      departments,
      users,
    };
  });

  // Ensure admin exists (in case someone deleted it manually earlier)
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    const hash = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: {
        username: "admin",
        passwordHash: hash,
        name: "管理者",
        role: Role.ADMIN,
      },
    });
  }

  console.log("[clean-all] done", {
    commentsDeleted: result.comments.count,
    auditLogsDeleted: result.auditLogs.count,
    returnsDeleted: result.returns.count,
    inspectionDocsDeleted: result.docs.count,
    channelsDeleted: result.channels.count,
    productsDeleted: result.products.count,
    importLogsDeleted: result.logs.count,
    syncConfigsDeleted: result.sync.count,
    documentTypesDeleted: result.docTypes.count,
    companyPrintHeadersDeleted: result.header.count,
    departmentsDeleted: result.departments.count,
    usersDeleted: result.users.count,
    adminEnsured: !admin,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

