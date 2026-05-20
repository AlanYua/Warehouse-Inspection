/**
 * 驗收單據：管理員解鎖
 * 對應 URL：/api/documents/[id]/unlock
 */

import { DocumentFlow, DocumentStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.unlock");
  if (f) return f;
  const { id } = await ctx.params;

  const doc = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: { flow: true, status: true, stockedAt: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "找不到單據" }, { status: 404 });
  }
  if (doc.status === DocumentStatus.SHIPPED) {
    return NextResponse.json({ error: "已出貨不可解鎖" }, { status: 403 });
  }
  if (u.role === Role.WAREHOUSE_SUPERVISOR && doc.flow !== DocumentFlow.IN) {
    return NextResponse.json(
      { error: "倉庫主管僅可解鎖「驗入」單據" },
      { status: 403 },
    );
  }
  if (
    u.role === Role.WAREHOUSE_SUPERVISOR &&
    doc.flow === DocumentFlow.IN &&
    doc.stockedAt != null
  ) {
    return NextResponse.json(
      { error: "已入庫不可解鎖，請洽管理者" },
      { status: 403 },
    );
  }

  const out = await prisma.inspectionDoc.update({
    where: { id },
    data: {
      status: DocumentStatus.PENDING,
      lockedByUserId: null,
      lockedAt: null,
      inspectorId: null,
      pickerId: null,
      ...(doc.flow === DocumentFlow.IN
        ? { stockedAt: null, stockedById: null }
        : {}),
    },
    select: { documentNumber: true, flow: true },
  });
  await writeAudit({
    user: u,
    action: "doc.unlock",
    targetType: "InspectionDoc",
    targetId: id,
    targetLabel: out.documentNumber,
    summary: `管理員/主管解鎖（${out.flow === DocumentFlow.IN ? "驗入" : "驗出"}）`,
  });
  return NextResponse.json({ ok: true });
}
