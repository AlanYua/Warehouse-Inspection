/**
 * 日報表：當天已出貨單據
 * URL: /api/reports/daily-shipped?date=YYYY-MM-DD (optional, default today)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-guard";
import { can } from "@/lib/permissions";

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
    // default today (server local date)
    (() => {
      const now = new Date();
      return parseYmd(toYmdLocal(now))!;
    })();
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

  // shippedAt 優先；舊資料若 shippedAt 為 null，fallback 用 updatedAt（狀態已出貨時）
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
    date: toYmdLocal(new Date(startUtc.getTime())),
    totalDocs: docs.length,
    byDepartment: out,
  });
}

