/**
 * 日報表（已出貨）：下載 Excel
 * URL: /api/reports/daily-shipped/excel?date=YYYY-MM-DD (optional, default today)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-guard";
import { can } from "@/lib/permissions";
import { buildDailyShippedWorkbook } from "@/lib/export/daily-shipped-excel";

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

function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function exportName(dateYmd: string) {
  const safe = dateYmd.replaceAll("-", "");
  return `daily-shipped-${safe}.xlsx`;
}

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(u.role, "dashboard.view") && !can(u.role, "documents.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dateQ = url.searchParams.get("date");
  const startUtc =
    parseYmd(dateQ) ??
    (() => {
      const now = new Date();
      return parseYmd(toYmdLocal(now))!;
    })();
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
  const dateYmd = toYmdLocal(new Date(startUtc.getTime()));

  const docs = await prisma.inspectionDoc.findMany({
    where: {
      flow: "OUT",
      status: "SHIPPED",
      OR: [
        { shippedAt: { gte: startUtc, lte: endUtc } },
        { AND: [{ shippedAt: null }, { updatedAt: { gte: startUtc, lte: endUtc } }] },
      ],
    },
    select: {
      id: true,
      documentType: true,
      documentNumber: true,
      counterpartyName: true,
      logisticsNo: true,
      packageCount: true,
      departmentId: true,
      department: { select: { name: true } },
    },
    orderBy: [{ departmentId: "asc" }, { documentType: "asc" }, { documentNumber: "asc" }],
    take: 5000,
  });

  const docIds = docs.map((d) => d.id);
  const sums =
    docIds.length === 0
      ? []
      : await prisma.documentLine.groupBy({
          by: ["documentId"],
          where: { documentId: { in: docIds } },
          _sum: { inspectQuantity: true },
        });
  const qtyByDocId = new Map(sums.map((s) => [s.documentId, s._sum.inspectQuantity ?? 0]));

  const docRows = docs.map((d) => ({
    departmentId: d.departmentId,
    departmentName: d.department.name,
    documentType: d.documentType,
    documentNumber: d.documentNumber,
    counterpartyName: d.counterpartyName ?? null,
    logisticsNo: d.logisticsNo ?? null,
    packageCount: d.packageCount ?? null,
    inspectTotal: qtyByDocId.get(d.id) ?? 0,
  }));

  // 品項彙總：依部門 + productCode + barcode 聚合 inspectQuantity，再補 brand
  const lines =
    docIds.length === 0
      ? []
      : await prisma.documentLine.findMany({
          where: { documentId: { in: docIds } },
          select: {
            productCode: true,
            barcode: true,
            inspectQuantity: true,
            document: { select: { departmentId: true, department: { select: { name: true } } } },
          },
          take: 200000,
        });

  const productCodes = Array.from(new Set(lines.map((l) => l.productCode)));
  const products =
    productCodes.length === 0
      ? []
      : await prisma.product.findMany({
          where: { productCode: { in: productCodes } },
          select: { productCode: true, brand: true, barcode: true },
        });
  const brandByCode = new Map(products.map((p) => [p.productCode, p.brand ?? ""]));

  const itemAgg = new Map<
    string,
    {
      departmentId: string;
      departmentName: string;
      productCode: string;
      barcode: string;
      inspectTotal: number;
    }
  >();

  for (const l of lines) {
    const deptId = l.document.departmentId;
    const deptName = l.document.department.name;
    const barcode = l.barcode ?? "";
    const key = `${deptId}||${l.productCode}||${barcode}`;
    const prev = itemAgg.get(key);
    const add = l.inspectQuantity ?? 0;
    if (!prev) {
      itemAgg.set(key, {
        departmentId: deptId,
        departmentName: deptName,
        productCode: l.productCode,
        barcode,
        inspectTotal: add,
      });
    } else {
      prev.inspectTotal += add;
    }
  }

  const itemRows = Array.from(itemAgg.values())
    .map((r) => ({
      ...r,
      brand: brandByCode.get(r.productCode) ?? "",
    }))
    .sort((a, b) => {
      const d = a.departmentName.localeCompare(b.departmentName, "zh-Hant");
      if (d !== 0) return d;
      const br = (a.brand ?? "").localeCompare(b.brand ?? "", "zh-Hant");
      if (br !== 0) return br;
      const pc = a.productCode.localeCompare(b.productCode, "en");
      if (pc !== 0) return pc;
      return (a.barcode ?? "").localeCompare(b.barcode ?? "", "en");
    });

  const bytes = await buildDailyShippedWorkbook({ dateYmd, docs: docRows, items: itemRows });
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);

  return new NextResponse(new Blob([ab]), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportName(dateYmd)}"`,
    },
  });
}

