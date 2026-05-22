/**
 * 品項出貨／入庫歷史（唯讀查詢）：依貨號或條碼查驗入驗出數量
 * URL: GET /api/reports/shipping-history?q=...&departmentId=&dateFrom=&dateTo=&flow=OUT|IN
 */
import { NextResponse } from "next/server";
import { DocumentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { forbidIfNoPermission, getSessionUser } from "@/lib/api-guard";
import { codesMatchProduct, normBarcode, normCode } from "@/lib/product-code";
import { summarizeShippingHistory } from "@/lib/shipping-history-summary";

const querySchema = z.object({
  q: z.string().min(1),
  departmentId: z.string().min(1).optional(),
  flow: z.enum(["OUT", "IN"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(50_000).optional(),
});

function parseYmd(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function eventAt(doc: {
  flow: "OUT" | "IN";
  shippedAt: Date | null;
  stockedAt: Date | null;
}): Date | null {
  if (doc.flow === "OUT") return doc.shippedAt;
  return doc.stockedAt;
}

/** 入庫為正、出貨為負 */
function signedQty(qty: number, flow: "OUT" | "IN"): number {
  return flow === "OUT" ? -qty : qty;
}

function isFinalizedDoc(doc: {
  flow: "OUT" | "IN";
  status: DocumentStatus;
  shippedAt: Date | null;
  stockedAt: Date | null;
}): boolean {
  if (doc.flow === "OUT") {
    return doc.status === DocumentStatus.SHIPPED && doc.shippedAt != null;
  }
  return (
    doc.status === DocumentStatus.COMPLETED &&
    doc.stockedAt != null
  );
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = forbidIfNoPermission(u.role, "reports.shipping-history.view");
  if (denied) return denied;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    flow: url.searchParams.get("flow") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rawQ = parsed.data.q.trim();
  const nc = normCode(rawQ);
  const nb = normBarcode(rawQ);
  const take = parsed.data.limit ?? 200;
  const skip = parsed.data.offset ?? 0;
  const from = parseYmd(parsed.data.dateFrom ?? null);
  const to0 = parseYmd(parsed.data.dateTo ?? null);
  const to = to0 ? new Date(to0.getTime() + 24 * 60 * 60 * 1000 - 1) : null;

  const productCodes = new Set<string>();
  const barcodes = new Set<string>();
  if (nc) productCodes.add(nc);
  if (rawQ) productCodes.add(rawQ);
  if (rawQ) barcodes.add(rawQ);
  if (nb) barcodes.add(nb);

  const products = await prisma.product.findMany({
    where: {
      OR: [
        ...(nc ? [{ productCode: { equals: nc, mode: "insensitive" as const } }] : []),
        ...(rawQ ? [{ productCode: { equals: rawQ, mode: "insensitive" as const } }] : []),
        ...(rawQ ? [{ barcode: { equals: rawQ, mode: "insensitive" as const } }] : []),
        ...(nb ? [{ barcode: { equals: nb, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { productCode: true, barcode: true, name: true },
    take: 20,
  });

  for (const p of products) {
    productCodes.add(p.productCode);
    if (p.barcode) barcodes.add(p.barcode);
  }

  const lineOr: Prisma.DocumentLineWhereInput[] = [];
  const codeList = [...productCodes].filter(Boolean);
  const barcodeList = [...barcodes].filter(Boolean);
  if (codeList.length) lineOr.push({ productCode: { in: codeList } });
  if (barcodeList.length) {
    lineOr.push({ barcode: { in: barcodeList } });
  }
  if (!lineOr.length) {
    return NextResponse.json({
      query: rawQ,
      product: null,
      summary: {
        purchaseQty: 0,
        shippedQty: 0,
        customerReturnQty: 0,
        supplierReturnQty: 0,
        netStock: 0,
      },
      rows: [],
      total: 0,
    });
  }

  const deptFilter = parsed.data.departmentId
    ? { departmentId: parsed.data.departmentId }
    : {};

  const flowWhere: Prisma.InspectionDocWhereInput =
    parsed.data.flow === "OUT"
      ? { flow: "OUT", status: DocumentStatus.SHIPPED, shippedAt: { not: null } }
      : parsed.data.flow === "IN"
        ? {
            flow: "IN",
            status: DocumentStatus.COMPLETED,
            stockedAt: { not: null },
          }
        : {
            OR: [
              {
                flow: "OUT",
                status: DocumentStatus.SHIPPED,
                shippedAt: { not: null },
              },
              {
                flow: "IN",
                status: DocumentStatus.COMPLETED,
                stockedAt: { not: null },
              },
            ],
          };

  const docWhere: Prisma.InspectionDocWhereInput = {
    ...flowWhere,
    ...deptFilter,
  };

  const lines = await prisma.documentLine.findMany({
    where: {
      OR: lineOr,
      document: docWhere,
    },
    include: {
      document: {
        select: {
          id: true,
          documentNumber: true,
          documentType: true,
          flow: true,
          status: true,
          counterpartyName: true,
          documentDate: true,
          shippedAt: true,
          stockedAt: true,
          updatedAt: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ document: { updatedAt: "desc" } }],
    take: 2000,
  });

  const matched = lines.filter(
    (l) =>
      codesMatchProduct(rawQ, l.productCode, l.barcode) &&
      isFinalizedDoc(l.document),
  );

  const dated = matched.filter((l) => {
    const at = eventAt(l.document);
    if (!at) return false;
    if (from && at < from) return false;
    if (to && at > to) return false;
    return true;
  });

  dated.sort(
    (a, b) =>
      eventAt(b.document)!.getTime() - eventAt(a.document)!.getTime(),
  );

  const total = dated.length;
  const page = dated.slice(skip, skip + take);

  const summary = summarizeShippingHistory(dated);

  const product =
    products.find((p) => codesMatchProduct(rawQ, p.productCode, p.barcode)) ??
    products[0] ??
    null;

  return NextResponse.json({
    query: rawQ,
    product: product
      ? {
          productCode: product.productCode,
          name: product.name,
          barcode: product.barcode,
        }
      : page[0]
        ? {
            productCode: page[0].productCode,
            name: page[0].productName,
            barcode: page[0].barcode,
          }
        : null,
    summary,
    total,
    rows: page.map((l) => {
      const d = l.document;
      const at = eventAt(d)!;
      const statusLabel = d.flow === "IN" ? "已入庫" : "已出貨";
      return {
        lineId: l.id,
        documentId: d.id,
        flow: d.flow,
        documentType: d.documentType,
        documentNumber: d.documentNumber,
        counterpartyName: d.counterpartyName,
        departmentName: d.department.name,
        documentDate: toIso(d.documentDate),
        eventAt: at.toISOString(),
        statusLabel,
        productCode: l.productCode,
        productName: l.productName,
        barcode: l.barcode,
        docQuantity: signedQty(l.docQuantity, d.flow),
        inspectQuantity: signedQty(l.inspectQuantity, d.flow),
      };
    }),
  });
}
