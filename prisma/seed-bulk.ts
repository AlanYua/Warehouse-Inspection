/**
 * 大量灌資料（用來壓測用）
 *
 * 用法（建議先 npm run db:push）：
 *   set SEED_DEMO=YES && npm run db:seed      # 先確保 admin 存在
 *   npm run db:seed-bulk
 *
 * 參數（環境變數）：
 *   BULK_DEPARTMENTS=5
 *   BULK_CHANNELS_PER_DEPT=50
 *   BULK_PRODUCTS=20000
 *   BULK_DOCS=200000
 *   BULK_LINES_PER_DOC=10
 *   BULK_STATUS=SHIPPED | PENDING | INSPECTING | COMPLETED | MIXED
 *
 * 注意：
 * - 這會在 DB 內快速長出大量資料，請在「測試 DB」跑。
 * - 主要用來把 `/api/documents`（contains）與 `/api/dashboard` 推到瓶頸。
 */
import "dotenv/config";
import {
  PrismaClient,
  DocumentStatus,
  DocumentFlow,
  AcceptMethod,
  DocumentSource,
} from "@prisma/client";

const prisma = new PrismaClient();

function n(v: unknown, d: number): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : d;
}

function pickStatus(i: number, mode: string): DocumentStatus {
  if (mode === "PENDING") return DocumentStatus.PENDING;
  if (mode === "INSPECTING") return DocumentStatus.INSPECTING;
  if (mode === "COMPLETED") return DocumentStatus.COMPLETED;
  if (mode === "SHIPPED") return DocumentStatus.SHIPPED;
  // MIXED：偏向 SHIPPED/COMPLETED（更接近真實累積的歷史資料）
  const r = i % 10;
  if (r < 1) return DocumentStatus.PENDING;
  if (r < 2) return DocumentStatus.INSPECTING;
  if (r < 5) return DocumentStatus.COMPLETED;
  return DocumentStatus.SHIPPED;
}

async function main() {
  const departments = n(process.env.BULK_DEPARTMENTS, 5);
  const channelsPerDept = n(process.env.BULK_CHANNELS_PER_DEPT, 50);
  const productsN = n(process.env.BULK_PRODUCTS, 20_000);
  const docsN = n(process.env.BULK_DOCS, 200_000);
  const linesPerDoc = n(process.env.BULK_LINES_PER_DOC, 10);
  const statusMode = (process.env.BULK_STATUS || "MIXED").toUpperCase();

  console.log(
    JSON.stringify(
      {
        departments,
        channelsPerDept,
        productsN,
        docsN,
        linesPerDoc,
        statusMode,
      },
      null,
      2,
    ),
  );

  // 1) Departments + Channels
  const deptNames = Array.from({ length: departments }, (_, i) => `BULK-部門-${String(i + 1).padStart(2, "0")}`);
  await prisma.department.createMany({
    data: deptNames.map((name) => ({ name })),
    skipDuplicates: true,
  });
  const deptRows = await prisma.department.findMany({
    where: { name: { in: deptNames } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const channels = [];
  for (const d of deptRows) {
    for (let i = 0; i < channelsPerDept; i++) {
      const code = `BCH-${d.name.split("-").pop()}-${String(i + 1).padStart(4, "0")}`;
      channels.push({
        channelCode: code,
        name: `批量通路 ${code}`,
        phone: null,
        address: null,
        lingyueCode: null,
        departmentId: d.id,
      });
    }
  }
  // createMany 大量資料請分批，避免單次 payload 過大
  const chBatch = 2000;
  for (let i = 0; i < channels.length; i += chBatch) {
    await prisma.channel.createMany({
      data: channels.slice(i, i + chBatch),
      skipDuplicates: true,
    });
  }

  const channelRows = await prisma.channel.findMany({
    where: { channelCode: { startsWith: "BCH-" } },
    select: { channelCode: true, departmentId: true },
  });
  if (channelRows.length === 0) throw new Error("no channels created");

  // 2) Products
  // productCode unique；barcode 允許 null/重複但我們也給 unique，方便查詢
  const prodBatch = 5000;
  for (let i = 0; i < productsN; i += prodBatch) {
    const batch = [];
    const end = Math.min(productsN, i + prodBatch);
    for (let j = i; j < end; j++) {
      const code = `BSKU-${String(j + 1).padStart(8, "0")}`;
      batch.push({
        productCode: code,
        barcode: `9${String(j + 1).padStart(12, "0")}`,
        name: `批量商品 ${code}`,
        brand: `Brand-${String((j % 50) + 1).padStart(2, "0")}`,
        storageLocation: `Z-${String((j % 200) + 1).padStart(3, "0")}`,
        isActive: true,
      });
    }
    await prisma.product.createMany({ data: batch, skipDuplicates: true });
    if (i === 0 || (i + prodBatch) % (prodBatch * 5) === 0) {
      console.log(`[bulk] products: ${Math.min(productsN, i + prodBatch)}/${productsN}`);
    }
  }

  // 3) Documents + Lines
  // 這段是壓測關鍵：InspectionDoc + DocumentLine 的總量
  // 為了速度，我們用「先 create docs，再 create lines」；每批 docs 需要先抓回 id
  const docBatch = 500;
  const productCodes = Array.from({ length: productsN }, (_, i) => `BSKU-${String(i + 1).padStart(8, "0")}`);
  const docTypes = ["銷貨出庫", "調撥出庫", "銷退", "採購入庫", "調撥入庫"];

  for (let offset = 0; offset < docsN; offset += docBatch) {
    const end = Math.min(docsN, offset + docBatch);
    const docs = [];
    for (let i = offset; i < end; i++) {
      const ch = channelRows[i % channelRows.length];
      const st = pickStatus(i, statusMode);
      const flow = i % 5 === 0 ? DocumentFlow.IN : DocumentFlow.OUT;
      const docNo = `BULK-${flow}-${String(i + 1).padStart(10, "0")}`;
      const now = new Date();
      // documentDate 做一些分布，讓 dashboard/date filter 有「時間跨度」
      const docDate = new Date(now.getTime() - (i % 365) * 24 * 60 * 60 * 1000);
      docs.push({
        documentNumber: docNo,
        documentType: docTypes[i % docTypes.length],
        flow,
        documentDate: docDate,
        lingyueCode: null,
        channelCode: ch.channelCode,
        counterpartyName: `客戶-${String(i % 10_000).padStart(5, "0")}`,
        phone: null,
        address: null,
        departmentId: ch.departmentId,
        creatorName: "bulk-seed",
        status: st,
        acceptMethod: AcceptMethod.MANUAL,
        source: DocumentSource.API,
        shippedAt: st === DocumentStatus.SHIPPED ? now : null,
        stockedAt: flow === DocumentFlow.IN && st === DocumentStatus.COMPLETED && i % 3 === 0 ? now : null,
        packageCount: st === DocumentStatus.SHIPPED ? ((i % 5) + 1) : null,
        packageCountA: st === DocumentStatus.SHIPPED ? (i % 2) : null,
        packageCountC: st === DocumentStatus.SHIPPED ? ((i + 1) % 2) : null,
        packageSize: st === DocumentStatus.SHIPPED ? "60x40x40" : null,
      });
    }

    await prisma.inspectionDoc.createMany({ data: docs, skipDuplicates: true });

    // 取回剛建立這一批 doc 的 id
    const docNos = docs.map((d) => d.documentNumber);
    const createdDocs = await prisma.inspectionDoc.findMany({
      where: { documentNumber: { in: docNos } },
      select: { id: true, documentNumber: true },
    });
    const idByNo = new Map(createdDocs.map((d) => [d.documentNumber, d.id]));

    const lines = [];
    for (const d of docs) {
      const docId = idByNo.get(d.documentNumber);
      if (!docId) continue;
      for (let k = 0; k < linesPerDoc; k++) {
        const pIdx = (offset + k * 997) % productsN;
        const code = productCodes[pIdx];
        lines.push({
          documentId: docId,
          productCode: code,
          barcode: `9${String(pIdx + 1).padStart(12, "0")}`,
          productName: `批量商品 ${code}`,
          docQuantity: ((k % 5) + 1) * 1.0,
          inspectQuantity: d.status === DocumentStatus.SHIPPED || d.status === DocumentStatus.COMPLETED ? ((k % 5) + 1) * 1.0 : 0,
          remark: null,
          storageLocation: `Z-${String((pIdx % 200) + 1).padStart(3, "0")}`,
        });
      }
    }

    const lineBatch = 5000;
    for (let i = 0; i < lines.length; i += lineBatch) {
      await prisma.documentLine.createMany({
        data: lines.slice(i, i + lineBatch),
        skipDuplicates: true,
      });
    }

    if ((offset / docBatch) % 20 === 0) {
      console.log(`[bulk] docs: ${Math.min(docsN, offset + docBatch)}/${docsN}`);
    }
  }

  console.log("[bulk] done");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

