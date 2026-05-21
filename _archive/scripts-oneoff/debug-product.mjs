import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const codes = process.argv.slice(2).filter(Boolean);
if (codes.length === 0) {
  console.error("Usage: node scripts/debug-product.mjs <productCode> [more...]");
  process.exit(2);
}

try {
  const rows = await prisma.product.findMany({
    where: { productCode: { in: codes } },
    select: {
      productCode: true,
      name: true,
      barcode: true,
      storageLocation: true,
      isActive: true,
    },
    orderBy: { productCode: "asc" },
  });
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await prisma.$disconnect();
}

