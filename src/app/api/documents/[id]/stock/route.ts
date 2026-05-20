/**
 * 驗入單據：標記已入庫（已完成上架）
 * 對應 URL：/api/documents/[id]/stock
 */

import { DocumentFlow, DocumentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidIfNoPermission, getSessionUser } from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.stock");
  if (f) return f;

  const { id } = await ctx.params;
  const before = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: { id: true, flow: true, status: true, stockedAt: true },
  });
  if (!before) return NextResponse.json({ error: "找不到單據" }, { status: 404 });

  if (before.flow !== DocumentFlow.IN) {
    return NextResponse.json({ error: "僅驗入單據可標記入庫" }, { status: 400 });
  }
  if (before.status !== DocumentStatus.COMPLETED) {
    return NextResponse.json({ error: "需先完成驗收始可入庫" }, { status: 400 });
  }
  if (before.stockedAt) {
    return NextResponse.json({ error: "此單據已入庫" }, { status: 409 });
  }

  await prisma.inspectionDoc.update({
    where: { id },
    data: {
      stockedAt: new Date(),
      stockedById: u.id,
      lockedByUserId: null,
      lockedAt: null,
    },
  });

  const out = await prisma.inspectionDoc.findUnique({
    where: { id },
    include: {
      department: true,
      lines: true,
      lockedBy: { select: { id: true, name: true, username: true } },
      inspector: { select: { id: true, name: true, username: true } },
      picker: { select: { id: true, name: true, username: true } },
      stockedBy: { select: { id: true, name: true, username: true } },
    },
  });
  await writeAudit({
    user: u,
    action: "doc.stock",
    targetType: "InspectionDoc",
    targetId: id,
    targetLabel: out?.documentNumber ?? undefined,
    summary: "標記為已入庫上架",
  });
  return NextResponse.json(out);
}

