/**
 * DANGEROUS: Remove ALL current data for:
 * - InspectionDoc (and cascading DocumentLine)
 * - ReturnShipment
 * - Product
 * - Channel
 * - ImportLog
 * - AuditLog（操作紀錄）
 *
 * Run:
 *   DB_CLEAN_CONFIRM=YES npm run db:clean-current
 */
import "dotenv/config";
import { CommentTargetType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DB_CLEAN_CONFIRM !== "YES") {
    throw new Error(
      [
        "[clean-current] refused: missing confirmation.",
        'Set env var: DB_CLEAN_CONFIRM=YES (example: "DB_CLEAN_CONFIRM=YES npm run db:clean-current")',
      ].join("\n"),
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Comments are not FK-cascaded (targetId is polymorphic), so we must delete them explicitly.
    const comments = await tx.comment.deleteMany({
      where: {
        targetType: {
          in: [
            CommentTargetType.RETURN_SHIPMENT,
            CommentTargetType.DOCUMENT,
            CommentTargetType.PRODUCT,
            CommentTargetType.CHANNEL,
          ],
        },
      },
    });

    const returns = await tx.returnShipment.deleteMany({});

    // Delete docs first; lines are onDelete: Cascade.
    const docs = await tx.inspectionDoc.deleteMany({});

    // These are master data; safe after docs are gone.
    const products = await tx.product.deleteMany({});
    const channels = await tx.channel.deleteMany({});

    const importLogs = await tx.importLog.deleteMany({});
    const auditLogs = await tx.auditLog.deleteMany({});

    return { comments, returns, docs, products, channels, importLogs, auditLogs };
  });

  console.log("[clean-current] done", {
    commentsDeleted: result.comments.count,
    returnShipmentsDeleted: result.returns.count,
    inspectionDocsDeleted: result.docs.count,
    productsDeleted: result.products.count,
    channelsDeleted: result.channels.count,
    importLogsDeleted: result.importLogs.count,
    auditLogsDeleted: result.auditLogs.count,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

