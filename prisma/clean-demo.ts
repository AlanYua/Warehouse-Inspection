/**
 * Remove data created by prisma/seed.ts (demo-only keys).
 * Does not delete departments 倉儲一部 / 業務部 (may have real data).
 * Run: npm run db:clean-demo
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_USERNAMES = ["warehouse", "sales", "procurement"] as const;

async function main() {
  const delDocs = await prisma.inspectionDoc.deleteMany({
    where: { documentNumber: { startsWith: "DEMO-" } },
  });

  const ch = await prisma.channel.deleteMany({
    where: { channelCode: "CH-DEMO" },
  });

  const prod = await prisma.product.deleteMany({
    where: { productCode: { in: ["SKU-DEMO", "SKU-DEMO-B"] } },
  });

  const headerRow = await prisma.companyPrintHeader.findUnique({
    where: { id: 1 },
  });
  let header = 0;
  if (headerRow && headerRow.companyName === "示範公司") {
    await prisma.companyPrintHeader.delete({ where: { id: 1 } });
    header = 1;
  }

  const demoUsers = await prisma.user.findMany({
    where: { username: { in: [...DEMO_USERNAMES] } },
    select: { id: true, username: true },
  });

  let usersRemoved = 0;
  for (const u of demoUsers) {
    await prisma.inspectionDoc.updateMany({
      where: {
        OR: [
          { inspectorId: u.id },
          { pickerId: u.id },
          { lockedByUserId: u.id },
        ],
      },
      data: {
        inspectorId: null,
        pickerId: null,
        lockedByUserId: null,
        lockedAt: null,
      },
    });
    try {
      await prisma.user.delete({ where: { id: u.id } });
      usersRemoved += 1;
    } catch {
      console.warn(
        `[clean-demo] skip user ${u.username}: still referenced elsewhere`,
      );
    }
  }

  console.log("[clean-demo] done", {
    inspectionDocsDeleted: delDocs.count,
    channelsDeleted: ch.count,
    productsDeleted: prod.count,
    companyPrintHeaderDemoRemoved: header,
    seedUsersRemoved: usersRemoved,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
