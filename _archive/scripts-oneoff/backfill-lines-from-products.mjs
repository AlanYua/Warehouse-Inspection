import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHUNK = 2000;

function nonEmpty(s) {
  return typeof s === "string" && s.trim().length > 0;
}

try {
  let offset = 0;
  let total = 0;
  let updated = 0;
  let docUpdated = 0;

  for (;;) {
    const lines = await prisma.documentLine.findMany({
      where: {
        OR: [{ productName: "" }, { barcode: null }, { storageLocation: null }],
      },
      select: {
        id: true,
        productCode: true,
        barcode: true,
        productName: true,
        storageLocation: true,
      },
      orderBy: { id: "asc" },
      take: CHUNK,
      skip: offset,
    });
    if (lines.length === 0) break;
    total += lines.length;

    const codes = [...new Set(lines.map((l) => l.productCode).filter(nonEmpty))];
    const products =
      codes.length === 0
        ? []
        : await prisma.product.findMany({
            where: { productCode: { in: codes } },
            select: {
              productCode: true,
              name: true,
              barcode: true,
              storageLocation: true,
            },
          });
    const pMap = new Map(products.map((p) => [p.productCode, p]));

    const tx = [];
    for (const l of lines) {
      const p = pMap.get(l.productCode);
      if (!p) continue;
      const data = {};

      if (!nonEmpty(l.productName) && nonEmpty(p.name)) data.productName = p.name;
      if (!nonEmpty(l.barcode) && nonEmpty(p.barcode)) data.barcode = p.barcode;
      if (!nonEmpty(l.storageLocation) && nonEmpty(p.storageLocation)) {
        data.storageLocation = p.storageLocation;
      }

      if (Object.keys(data).length) {
        tx.push(prisma.documentLine.update({ where: { id: l.id }, data }));
      }
    }

    if (tx.length) {
      await prisma.$transaction(tx);
      updated += tx.length;
    }

    offset += lines.length;
    if (lines.length < CHUNK) break;
  }

  console.log(
    JSON.stringify({ scanned: total, updated }, null, 2),
  );

  // 補單據的通路資料（名稱/電話/地址/凌越）
  const docs = await prisma.inspectionDoc.findMany({
    where: {
      channelCode: { not: null },
      OR: [
        { counterpartyName: null },
        { counterpartyName: "" },
        { phone: null },
        { address: null },
        { lingyueCode: null },
      ],
    },
    select: {
      id: true,
      channelCode: true,
      counterpartyName: true,
      phone: true,
      address: true,
      lingyueCode: true,
    },
    take: 5000,
  });
  const chCodes = Array.from(
    new Set(docs.map((d) => (d.channelCode ?? "").trim()).filter(Boolean)),
  );
  const channels =
    chCodes.length === 0
      ? []
      : await prisma.channel.findMany({
          where: { channelCode: { in: chCodes } },
          select: { channelCode: true, name: true, phone: true, address: true, lingyueCode: true },
        });
  const chMap = new Map(channels.map((c) => [c.channelCode, c]));
  const tx2 = [];
  for (const d of docs) {
    const code = (d.channelCode ?? "").trim();
    const ch = code ? chMap.get(code) : null;
    if (!ch) continue;
    const data = {};
    if (!nonEmpty(d.counterpartyName) && nonEmpty(ch.name)) data.counterpartyName = ch.name;
    if (!nonEmpty(d.phone) && nonEmpty(ch.phone)) data.phone = ch.phone;
    if (!nonEmpty(d.address) && nonEmpty(ch.address)) data.address = ch.address;
    if (!nonEmpty(d.lingyueCode) && nonEmpty(ch.lingyueCode)) data.lingyueCode = ch.lingyueCode;
    if (Object.keys(data).length) {
      tx2.push(prisma.inspectionDoc.update({ where: { id: d.id }, data }));
    }
  }
  if (tx2.length) {
    await prisma.$transaction(tx2);
    docUpdated = tx2.length;
  }
  console.log(JSON.stringify({ docsScanned: docs.length, docsUpdated: docUpdated }, null, 2));
} finally {
  await prisma.$disconnect();
}

