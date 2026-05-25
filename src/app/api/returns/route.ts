/**
 * 退貨／退倉登記
 * 對應 URL：/api/returns
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(u.role, "returns.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get("departmentId")?.trim() || "";
  // 新參數：以收貨時間查詢
  const receivedFrom = searchParams.get("receivedFrom");
  const receivedTo = searchParams.get("receivedTo");
  // 舊參數相容：from/to 也視為收貨時間篩選
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const timeFrom = receivedFrom ?? from;
  const timeTo = receivedTo ?? to;
  const hasTimeFilter = Boolean(timeFrom || timeTo);

  function parseDateOrDatetime(input: string, mode: "from" | "to"): Date | null {
    const s = input.trim();
    if (!s) return null;
    // date-only: YYYY-MM-DD（依本機時區）
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
      if (mode === "from") return new Date(y, mo - 1, d, 0, 0, 0, 0);
      return new Date(y, mo - 1, d, 23, 59, 59, 999);
    }
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const parsedFrom = timeFrom ? parseDateOrDatetime(timeFrom, "from") : null;
  const parsedTo = timeTo ? parseDateOrDatetime(timeTo, "to") : null;
  const range =
    hasTimeFilter && (parsedFrom || parsedTo)
      ? {
          ...(parsedFrom ? { gte: parsedFrom } : {}),
          ...(parsedTo ? { lte: parsedTo } : {}),
        }
      : null;

  const rows = await prisma.returnShipment.findMany({
    where: {
      ...(deptId ? { departmentId: deptId } : {}),
      ...(range
        ? {
            OR: [
              { receivedAt: range },
              { receivedAt: null, createdAt: range },
            ],
          }
        : {}),
    },
    include: { department: true },
    // 新資料以 receivedAt 排序；舊資料（receivedAt null）再以 createdAt
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json(rows);
}

const postSchema = z.object({
  logisticsNo: z.string().min(1),
  packageName: z.string().min(1),
  pieceCount: z.number().int().positive(),
  departmentId: z.string().min(1),
  recipientName: z.string().min(1),
  receivedAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "returns.manage");
  if (f) return f;
  const body = postSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const logisticsNo = body.data.logisticsNo.trim();
  if (!logisticsNo) {
    return NextResponse.json({ error: "物流單號不可空白" }, { status: 400 });
  }

  const receivedAt =
    typeof body.data.receivedAt === "string" ? new Date(body.data.receivedAt) : null;
  if (receivedAt && Number.isNaN(receivedAt.getTime())) {
    return NextResponse.json({ error: "收貨時間格式不正確" }, { status: 400 });
  }

  const existing = await prisma.returnShipment.findFirst({
    where: { logisticsNo },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const row = await prisma.returnShipment.update({
      where: { id: existing.id },
      data: {
        pieceCount: { increment: 1 },
        // 若舊資料沒有 receivedAt，第一次重複掃到時補上
        ...(existing.receivedAt ? {} : { receivedAt: receivedAt ?? new Date() }),
      },
      include: { department: true },
    });
    await writeAudit({
      user: u,
      action: "return.increment",
      targetType: "ReturnShipment",
      targetId: row.id,
      targetLabel: `${row.logisticsNo} ${row.packageName}`,
      summary: `退貨件數+1（目前共 ${row.pieceCount} 件）`,
      meta: { logisticsNo: row.logisticsNo, pieceCount: row.pieceCount },
    });
    return NextResponse.json({
      duplicate: true,
      message: `此物流單號已存在，件數已 +1（目前共 ${row.pieceCount} 件）`,
      row,
    });
  }

  const row = await prisma.returnShipment.create({
    data: {
      ...body.data,
      logisticsNo,
      receivedAt: receivedAt ?? new Date(),
    },
    include: { department: true },
  });
  await writeAudit({
    user: u,
    action: "return.create",
    targetType: "ReturnShipment",
    targetId: row.id,
    targetLabel: `${row.logisticsNo} ${row.packageName}`,
    summary: `新增退貨 ${row.logisticsNo} ${row.packageName}（${row.pieceCount} 件，收件人：${row.recipientName}）`,
    meta: {
      logisticsNo: row.logisticsNo,
      packageName: row.packageName,
      pieceCount: row.pieceCount,
      departmentId: row.departmentId,
      recipientName: row.recipientName,
    },
  });
  return NextResponse.json({ duplicate: false, row });
}
