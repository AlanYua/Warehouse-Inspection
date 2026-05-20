/**
 * 單據類型選項：單筆維護
 * 對應 URL：/api/document-types/[id]
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(120),
  flow: z.enum(["OUT", "IN"]).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;
  const { id } = await ctx.params;
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const newName = body.data.name.trim().replace(/\s+/g, " ");
  if (!newName) {
    return NextResponse.json({ error: "名稱不可空白" }, { status: 400 });
  }
  const newFlow = body.data.flow;

  const existing = await prisma.documentTypeOption.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.name === newName && (newFlow == null || existing.flow === newFlow)) {
    return NextResponse.json(existing);
  }

  if (existing.name !== newName) {
    const clash = await prisma.documentTypeOption.findUnique({
      where: { name: newName },
    });
    if (clash) {
      return NextResponse.json({ error: "名稱與其他類型重複" }, { status: 409 });
    }
  }

  await prisma.$transaction([
    ...(existing.name !== newName
      ? [
          prisma.inspectionDoc.updateMany({
            where: { documentType: existing.name },
            data: { documentType: newName },
          }),
        ]
      : []),
    prisma.documentTypeOption.update({
      where: { id },
      data: {
        ...(existing.name !== newName ? { name: newName } : {}),
        ...(newFlow != null ? { flow: newFlow } : {}),
      },
    }),
  ]);
  const row = await prisma.documentTypeOption.findUnique({ where: { id } });
  await writeAudit({
    user: u,
    action: "doctype.update",
    targetType: "DocumentTypeOption",
    targetId: id,
    targetLabel: row?.name ?? newName,
    summary: `更新單據類型 ${existing.name} → ${row?.name ?? newName}（${row?.flow ?? existing.flow}）`,
    meta: {
      before: { name: existing.name, flow: existing.flow },
      after: { name: row?.name ?? newName, flow: row?.flow ?? newFlow ?? existing.flow },
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;
  const { id } = await ctx.params;

  const existing = await prisma.documentTypeOption.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const inUse = await prisma.inspectionDoc.count({
    where: { documentType: existing.name },
  });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `仍有 ${inUse} 筆單據使用此類型，無法刪除` },
      { status: 409 },
    );
  }
  await prisma.documentTypeOption.delete({ where: { id } });
  await writeAudit({
    user: u,
    action: "doctype.delete",
    targetType: "DocumentTypeOption",
    targetId: id,
    targetLabel: existing.name,
    summary: `刪除單據類型 ${existing.name}`,
  });
  return NextResponse.json({ ok: true });
}
