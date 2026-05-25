/**
 * 日報表：已出貨單據
 * URL: /api/reports/daily-shipped?dateFrom=&dateTo=&departmentId=
 * 相容：?date=YYYY-MM-DD
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-guard";
import { can } from "@/lib/permissions";
import { resolveDailyDateRange } from "@/lib/reports/daily-date-range";

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

  const docs = await prisma.inspectionDoc.findMany({
    where: {
      flow: "OUT",
      status: "SHIPPED",
      ...(departmentId ? { departmentId } : {}),
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

  const sums =
    docs.length === 0
      ? []
      : await prisma.documentLine.groupBy({
          by: ["documentId"],
          where: { documentId: { in: docs.map((d) => d.id) } },
          _sum: { inspectQuantity: true },
        });
  const qtyByDocId = new Map(sums.map((s) => [s.documentId, s._sum.inspectQuantity ?? 0]));

  const byDepartment: Record<
    string,
    {
      departmentId: string;
      departmentName: string;
      rows: Array<{
        id: string;
        documentType: string;
        documentNumber: string;
        counterpartyName: string | null;
        inspectTotal: number;
        logisticsNo: string | null;
        packageCount: number | null;
      }>;
    }
  > = {};

  for (const d of docs) {
    const key = d.departmentId;
    if (!byDepartment[key]) {
      byDepartment[key] = {
        departmentId: d.departmentId,
        departmentName: d.department.name,
        rows: [],
      };
    }
    byDepartment[key].rows.push({
      id: d.id,
      documentType: d.documentType,
      documentNumber: d.documentNumber,
      counterpartyName: d.counterpartyName ?? null,
      inspectTotal: qtyByDocId.get(d.id) ?? 0,
      logisticsNo: d.logisticsNo ?? null,
      packageCount: d.packageCount ?? null,
    });
  }

  const out = Object.values(byDepartment).sort((a, b) =>
    a.departmentName.localeCompare(b.departmentName, "zh-Hant"),
  );

  return NextResponse.json({
    dateFrom,
    dateTo,
    totalDocs: docs.length,
    byDepartment: out,
  });
}
