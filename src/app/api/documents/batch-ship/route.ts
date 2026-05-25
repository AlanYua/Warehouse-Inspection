/**
 * 驗收單據：批次標記出貨
 * 對應 URL：/api/documents/batch-ship
 */

import { DocumentStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";
import { requireConfirmPassword } from "@/lib/reauth";
import { z } from "zod";

const bodySchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1),
  logisticsNo: z.string().trim().min(1),
  packageSize: z.string().trim().min(1).optional(),
  confirmPassword: z.string().min(1),
});

async function resolveDefaultWarehousePickerId(sessionUserId: string, sessionRole: Role) {
  if (sessionRole === Role.WAREHOUSE) {
    return sessionUserId;
  }
  const wh = await prisma.user.findFirst({
    where: { role: Role.WAREHOUSE },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  return wh?.id ?? null;
}

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.ship");
  if (f) return f;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "請提供 documentIds、物流單號與 confirmPassword" },
      { status: 400 },
    );
  }

  const reauth = await requireConfirmPassword(
    u.id,
    parsed.data.confirmPassword,
  );
  if (reauth) return reauth;

  const documentIds = [...new Set(parsed.data.documentIds)];
  const logisticsNo = parsed.data.logisticsNo.trim();
  const packageSize = parsed.data.packageSize?.trim();

  const pickerId = await resolveDefaultWarehousePickerId(u.id, u.role);
  if (!pickerId) {
    return NextResponse.json(
      { error: "系統中無倉管帳號，無法批次出貨" },
      { status: 400 },
    );
  }

  const found = await prisma.inspectionDoc.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, documentNumber: true, status: true },
  });

  if (found.length !== documentIds.length) {
    const have = new Set(found.map((d) => d.id));
    const missing = documentIds.filter((id) => !have.has(id));
    return NextResponse.json(
      { error: "部分單據不存在", missingIds: missing },
      { status: 400 },
    );
  }

  const notCompleted = found.filter(
    (d) => d.status !== DocumentStatus.COMPLETED,
  );
  if (notCompleted.length > 0) {
    return NextResponse.json(
      {
        error: "僅「已完成」狀態可批次標記已出貨",
        details: notCompleted.map((d) => ({
          documentNumber: d.documentNumber,
          status: d.status,
        })),
      },
      { status: 400 },
    );
  }

  const docs = await prisma.inspectionDoc.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, packageCountA: true, packageCountC: true, packageCount: true },
  });
  const invalidAC = docs.filter((d) => (d.packageCountA ?? 0) + (d.packageCountC ?? 0) <= 0);
  if (invalidAC.length > 0) {
    return NextResponse.json(
      { error: "部分單據尚未填寫 A/C 箱數，無法批次出貨", missingACIds: invalidAC.map((d) => d.id) },
      { status: 400 },
    );
  }

  const now = new Date();
  // 因為每張單據 A/C 箱數可能不同，不能用 updateMany 統一寫 packageCount
  const result = await prisma.$transaction(
    docs.map((d) =>
      prisma.inspectionDoc.update({
        where: { id: d.id },
        data: {
          status: DocumentStatus.SHIPPED,
          pickerId,
          logisticsNo,
          packageCount: (d.packageCountA ?? 0) + (d.packageCountC ?? 0),
          packageSize: packageSize ? packageSize : null,
          shippedAt: now,
          lockedByUserId: null,
          lockedAt: null,
        },
        select: { id: true },
      }),
    ),
  );

  if (result.length !== documentIds.length) {
    return NextResponse.json(
      { error: "更新筆數異常，請重新整理後再試" },
      { status: 409 },
    );
  }

  await writeAudit({
    user: u,
    action: "doc.batch-ship",
    targetType: "InspectionDoc",
    summary: `批次出貨 ${result.length} 筆（物流 ${logisticsNo}）`,
    meta: {
      count: result.length,
      logisticsNo,
      packageSize: packageSize ?? null,
      documentNumbers: found.map((d) => d.documentNumber).slice(0, 100),
    },
  });

  return NextResponse.json({ ok: true, count: result.length });
}
