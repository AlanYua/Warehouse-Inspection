import { PrismaClient, DocumentFlow, DocumentSource } from "@prisma/client";
import { prisma as prismaSingleton } from "@/lib/prisma";
import type { ExternalDocumentRow } from "./types";

function normBarcode(s: unknown): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-z]/g, "");
}

export type ApplyErrorDetail = {
  documentNumber: string;
  documentType: string;
  channelCode: string;
  reason: string;
};

type ApplyResult = {
  created: number;
  updated: number;
  errors: string[];
  errorDetails: ApplyErrorDetail[];
  /** 實際成功落庫的 keys（給呼叫端標記成功/覆蓋之用） */
  successKeys: Array<{
    documentNumber: string;
    documentType: string;
    channelCode: string;
  }>;
};

type ApplyOptions = {
  /** 每批處理的「單據數」（不是 lines 數）；5 萬列 excel 通常會先 group 成較少的 doc。 */
  chunkDocs?: number;
  /** 每次 createMany 的 lines 筆數；避免 Postgres 參數上限 */
  chunkLines?: number;
  /** 互動式 transaction timeout（ms）；大量匯入時務必拉長 */
  transactionTimeoutMs?: number;
};

/**
 * Excel / 外部來源匯入的「最小落庫邏輯」：
 * - 依部門名稱找到 Department
 * - upsert InspectionDoc + lines（先刪舊 lines 再建新的，避免差異比對）
 *
 * 注意：大量匯入時要避免：
 * - 每筆都查 Department / existing doc（N+1）
 * - 每筆都 deleteMany + createMany（N 次 roundtrip）
 */
export async function applyExternalRows(
  rows: ExternalDocumentRow[],
  source: DocumentSource,
  prisma: PrismaClient = prismaSingleton,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const errorDetails: ApplyErrorDetail[] = [];
  const successKeys: ApplyResult["successKeys"] = [];

  const chunkDocs = options.chunkDocs ?? 200;
  const chunkLines = options.chunkLines ?? 2000;
  const transactionTimeoutMs = options.transactionTimeoutMs ?? 120_000;

  // 先把部門一次抓出來，避免 N+1
  const deptNames = Array.from(
    new Set(rows.map((r) => (r.departmentName ?? "").trim()).filter(Boolean)),
  );
  const deptRows =
    deptNames.length === 0
      ? []
      : await prisma.department.findMany({
          where: { name: { in: deptNames } },
          select: { id: true, name: true },
        });
  const deptIdByName = new Map(deptRows.map((d) => [d.name, d.id]));

  const chunks: ExternalDocumentRow[][] = [];
  for (let i = 0; i < rows.length; i += chunkDocs) {
    chunks.push(rows.slice(i, i + chunkDocs));
  }

  for (const chunk of chunks) {
    // 這批裡先檢查部門存在（把錯誤集中起來，避免 transaction 裡一個錯全批 rollback）
    const okRows: ExternalDocumentRow[] = [];
    for (const r of chunk) {
      const deptName = (r.departmentName ?? "").trim();
      const deptId = deptName ? deptIdByName.get(deptName) : null;
      const detailKey = {
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        channelCode: r.channelCode ?? "",
      };
      if (!deptName) {
        const reason = "缺少部門";
        errors.push(`單據 ${r.documentNumber}: ${reason}`);
        errorDetails.push({ ...detailKey, reason });
        continue;
      }
      if (!deptId) {
        const reason = `部門「${deptName}」不存在`;
        errors.push(`單據 ${r.documentNumber}: ${reason}`);
        errorDetails.push({ ...detailKey, reason });
        continue;
      }
      okRows.push(r);
    }
    if (okRows.length === 0) continue;

    // 先找出既有 doc（OR 條件每批最多 200，DB 端有 @@unique + index，成本可控）
    const existing = await prisma.inspectionDoc.findMany({
      where: {
        OR: okRows.map((r) => ({
          documentNumber: r.documentNumber,
          channelCode: r.channelCode ?? null,
          documentType: r.documentType,
        })),
      },
      select: { documentNumber: true, channelCode: true, documentType: true },
    });
    const existingKey = new Set(
      existing.map(
        (d) => `${d.documentNumber}\u0001${d.channelCode ?? ""}\u0001${d.documentType}`,
      ),
    );

    const keyOf = (r: ExternalDocumentRow) =>
      `${r.documentNumber}\u0001${r.channelCode ?? ""}\u0001${r.documentType}`;

    await prisma.$transaction(
      async (tx) => {
      const ids: string[] = [];

      for (const r of okRows) {
        const deptId = deptIdByName.get((r.departmentName ?? "").trim())!;
        const docDate = r.documentDate ? new Date(r.documentDate) : null;
        const flow: DocumentFlow =
          r.flow === "IN" ? DocumentFlow.IN : DocumentFlow.OUT;

        const channelCode = (r.channelCode ?? "").trim() || null;
        const ch = channelCode
          ? await tx.channel.findUnique({
              where: { channelCode },
              select: {
                name: true,
                phone: true,
                address: true,
                lingyueCode: true,
              },
            })
          : null;
        const counterpartyName =
          (r.counterpartyName ?? "").trim() || ch?.name?.trim() || null;
        const phone = (r.phone ?? "").trim() || ch?.phone?.trim() || null;
        const address = (r.address ?? "").trim() || ch?.address?.trim() || null;
        const lingyueCode =
          (r.lingyueCode ?? "").trim() || ch?.lingyueCode?.trim() || null;

        // Prisma 對「nullable 欄位參與 composite unique」的 where input 型別較嚴格；
        // channelCode 為 null 時改用 id-hack 路徑（先找 id 再 upsert by id）。
        const existingId =
          channelCode == null
            ? (
                await tx.inspectionDoc.findFirst({
                  where: {
                    documentNumber: r.documentNumber,
                    channelCode: null,
                    documentType: r.documentType,
                  },
                  select: { id: true },
                })
              )?.id ?? null
            : null;

        const doc = await tx.inspectionDoc.upsert({
          where:
            r.channelCode == null
              ? existingId
                ? { id: existingId }
                : { id: "__never__" }
              : {
                  documentNumber_channelCode_documentType: {
                    documentNumber: r.documentNumber,
                    channelCode: r.channelCode,
                    documentType: r.documentType,
                  },
                },
          update: {
            documentDate: docDate,
            lingyueCode,
            counterpartyName,
            phone,
            address,
            departmentId: deptId,
            creatorName: r.creatorName ?? null,
            flow,
            source,
          },
          create: {
            documentNumber: r.documentNumber,
            documentType: r.documentType,
            flow,
            documentDate: docDate,
            lingyueCode,
            channelCode,
            counterpartyName,
            phone,
            address,
            departmentId: deptId,
            creatorName: r.creatorName ?? null,
            source,
          },
          select: { id: true },
        });
        ids.push(doc.id);
      }

      // 這批的 lines 一次刪、一致建（避免每張單據一個 roundtrip）
      await tx.documentLine.deleteMany({ where: { documentId: { in: ids } } });

      // 匯入的 lines 可能缺少品名/條碼/儲位：用商品主檔補齊（避免前端顯示空白）
      const productCodes = Array.from(
        new Set(
          okRows
            .flatMap((r) => r.lines.map((l) => (l.productCode ?? "").trim()))
            .filter(Boolean),
        ),
      );
      const barcodes = Array.from(
        new Set(
          okRows
            .flatMap((r) =>
              r.lines.map((l) =>
                normBarcode(l.barcode),
              ),
            )
            .filter(Boolean),
        ),
      );
      const products =
        productCodes.length === 0 && barcodes.length === 0
          ? []
          : await tx.product.findMany({
              where: {
                OR: [
                  ...(productCodes.length
                    ? [{ productCode: { in: productCodes } }]
                    : []),
                  ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
                ],
              },
              select: {
                productCode: true,
                name: true,
                barcode: true,
                storageLocation: true,
              },
            });
      const productByCode = new Map(products.map((p) => [p.productCode, p]));
      const productByBarcode = new Map(
        products
          .map((p) => [
            normBarcode(p.barcode),
            p,
          ] as const)
          .filter(([b]) => Boolean(b)),
      );

      const lineData = okRows.flatMap((r, idx) => {
        const documentId = ids[idx];
        return r.lines.map((l) => {
          const code = (l.productCode ?? "").trim();
          const rawBarcode = normBarcode(l.barcode);
          const p =
            (code ? productByCode.get(code) : null) ??
            (rawBarcode ? productByBarcode.get(rawBarcode) : null);

          const productCode = code || p?.productCode?.trim() || "";
          const barcode = rawBarcode || p?.barcode?.trim() || null;
          const productName =
            (l.productName ?? "").trim() || p?.name?.trim() || "";
          const storageLocation =
            (l.storageLocation ?? "").trim() ||
            p?.storageLocation?.trim() ||
            null;

          return {
            documentId,
            productCode,
            barcode,
            productName,
            docQuantity: l.docQuantity,
            remark: l.remark ?? "",
            storageLocation,
            inspectQuantity: 0,
          };
        });
      });

      if (lineData.length > 0) {
        for (let i = 0; i < lineData.length; i += chunkLines) {
          await tx.documentLine.createMany({
            data: lineData.slice(i, i + chunkLines),
          });
        }
      }
      },
      { timeout: transactionTimeoutMs },
    );

    for (const r of okRows) {
      if (existingKey.has(keyOf(r))) updated += 1;
      else created += 1;
      successKeys.push({
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        channelCode: r.channelCode ?? "",
      });
    }
  }

  return { created, updated, errors, errorDetails, successKeys };
}

