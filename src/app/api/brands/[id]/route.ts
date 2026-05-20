/**
 * 品牌主檔：更新/刪除
 * 對應 URL：/api/brands/:id
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { forbidIfNoPermission, getSessionUser } from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;

  const { id } = await ctx.params;
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const data: {
    name?: string;
    isActive?: boolean;
    sortOrder?: number;
  } = {};
  if (body.data.name !== undefined) {
    const nm = body.data.name.trim();
    if (!nm) return NextResponse.json({ error: "品牌名稱必填" }, { status: 400 });
    data.name = nm;
  }
  if (body.data.isActive !== undefined) data.isActive = body.data.isActive;
  if (body.data.sortOrder !== undefined) data.sortOrder = body.data.sortOrder;

  try {
    const row = await prisma.brandOption.update({ where: { id }, data });
    await writeAudit({
      user: u,
      action: "brand.update",
      targetType: "BrandOption",
      targetId: row.id,
      targetLabel: row.name,
      summary: `更新品牌 ${row.name}`,
      meta: data,
    });
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新失敗";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;

  const { id } = await ctx.params;
  const target = await prisma.brandOption.findUnique({ where: { id }, select: { name: true } });
  try {
    await prisma.brandOption.delete({ where: { id } });
    await writeAudit({
      user: u,
      action: "brand.delete",
      targetType: "BrandOption",
      targetId: id,
      targetLabel: target?.name ?? id,
      summary: `刪除品牌 ${target?.name ?? id}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "刪除失敗";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

