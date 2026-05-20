/**
 * 驗收單據：揀貨／驗收交棒釋放鎖
 * 對應 URL：/api/documents/[id]/release-lock
 */

import { DocumentStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

/** 揀貨／驗收完成一階段後交棒：解鎖但維持驗收中，同時間仍僅一人可鎖。 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.inspect");
  if (f) return f;

  const { id } = await ctx.params;
  const doc = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: {
      status: true,
      lockedByUserId: true,
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "找不到單據" }, { status: 404 });
  }
  if (doc.status !== DocumentStatus.INSPECTING) {
    return NextResponse.json(
      { error: "僅驗收中可交棒解鎖" },
      { status: 400 },
    );
  }
  if (!doc.lockedByUserId) {
    return NextResponse.json({ error: "單據未鎖定" }, { status: 400 });
  }
  const admin = u.role === Role.ADMIN;
  if (!admin && doc.lockedByUserId !== u.id) {
    return NextResponse.json({ error: "僅鎖定者可交棒解鎖" }, { status: 403 });
  }

  const out = await prisma.inspectionDoc.update({
    where: { id },
    data: {
      lockedByUserId: null,
      lockedAt: null,
    },
    select: { documentNumber: true },
  });
  await writeAudit({
    user: u,
    action: "doc.release-lock",
    targetType: "InspectionDoc",
    targetId: id,
    targetLabel: out.documentNumber,
    summary: "交棒釋放鎖定",
  });
  return NextResponse.json({ ok: true });
}
