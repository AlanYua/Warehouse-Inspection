import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const docNo = process.argv[2];
const doBackfill = process.argv.includes("--backfill");
if (!docNo) {
  console.error(
    "Usage: node scripts/debug-doc.mjs <documentNumber> [--backfill]",
  );
  process.exit(2);
}

try {
  const doc = await prisma.inspectionDoc.findFirst({
    where: { documentNumber: docNo },
    select: {
      id: true,
      documentNumber: true,
      documentType: true,
      flow: true,
      documentDate: true,
      lingyueCode: true,
      channelCode: true,
      counterpartyName: true,
      phone: true,
      address: true,
      source: true,
      department: { select: { name: true } },
      lines: {
        take: 20,
        select: {
          id: true,
          productCode: true,
          barcode: true,
          productName: true,
          docQuantity: true,
          storageLocation: true,
        },
      },
    },
  });
  if (doBackfill && doc) {
    const codes = [...new Set(doc.lines.map((l) => l.productCode))];
    const products = await prisma.product.findMany({
      where: { productCode: { in: codes } },
      select: { productCode: true, barcode: true, name: true },
    });
    const map = new Map(products.map((p) => [p.productCode, p]));
    const updates = [];
    for (const l of doc.lines) {
      const p = map.get(l.productCode);
      if (!p) continue;
      const data = {};
      if (!String(l.barcode ?? "").trim() && String(p.barcode ?? "").trim()) {
        data.barcode = p.barcode;
      }
      if (!String(l.productName ?? "").trim() && String(p.name ?? "").trim()) {
        data.productName = p.name;
      }
      if (Object.keys(data).length) {
        updates.push(prisma.documentLine.update({ where: { id: l.id }, data }));
      }
    }
    if (updates.length) await prisma.$transaction(updates);
  }
  const after = doBackfill
    ? await prisma.inspectionDoc.findUnique({
        where: { id: doc?.id ?? "__never__" },
        select: { lines: { take: 20, select: { productCode: true, barcode: true, productName: true } } },
      })
    : null;
  console.log(JSON.stringify(doc, null, 2));
  if (after) {
    console.log("\n--- after backfill ---\n");
    console.log(JSON.stringify(after, null, 2));
  }
} finally {
  await prisma.$disconnect();
}

