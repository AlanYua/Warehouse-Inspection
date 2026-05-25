/**
 * 日報表（已入庫）：下載 Excel
 * URL: /api/reports/daily-stocked/excel?dateFrom=&dateTo=&departmentId=
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-guard";
import { can } from "@/lib/permissions";
import { buildDailyStockedWorkbook } from "@/lib/export/daily-stocked-excel";
import {
  dailyRangeExportSuffix,
  formatDailyRangeLabel,
  resolveDailyDateRange,
} from "@/lib/reports/daily-date-range";

function exportName(dateFrom: string, dateTo: string) {
  return `daily-stocked-${dailyRangeExportSuffix(dateFrom, dateTo)}.xlsx`;
}

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(u.role, "dashboard.view") && !can(u.role, "documents.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const { startUtc, endUtc, dateFrom, dateTo } = resolveDailyDateRange({
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    date: url.searchParams.get("date"),
  });
  const departmentId = url.searchParams.get("departmentId")?.trim() || "";
  const dateLabel = formatDailyRangeLabel(dateFrom, dateTo);

  const docs = await prisma.inspectionDoc.findMany({
    where: {
      flow: "IN",
      status: "COMPLETED",
      ...(departmentId ? { departmentId } : {}),
      stockedAt: { gte: startUtc, lte: endUtc },
    },
    select: {
      id: true,
      documentType: true,
      documentNumber: true,
      counterpartyName: true,
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
    inspectTotal: qtyByDocId.get(d.id) ?? 0,
    packageCount: d.packageCount ?? null,
  }));

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
          select: { productCode: true, brand: true },
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

  const bytes = await buildDailyStockedWorkbook({
    dateLabel,
    docs: docRows,
    items: itemRows,
  });
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);

  return new NextResponse(new Blob([ab]), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportName(dateFrom, dateTo)}"`,
    },
  });
}
