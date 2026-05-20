/**
 * 部門主檔：單筆維護
 * 對應 URL：/api/departments/[id]
 */

import { Prisma } from "@prisma/client";
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
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const name = parsed.data.name.trim();
  const exists = await prisma.department.findUnique({ where: { id } });
  if (!exists) {
    return NextResponse.json({ error: "部門不存在" }, { status: 404 });
  }
  try {
    const row = await prisma.department.update({
      where: { id },
      data: { name },
    });
    await writeAudit({
      user: u,
      action: "department.update",
      targetType: "Department",
      targetId: row.id,
      targetLabel: row.name,
      summary: `更新部門 ${exists.name} → ${row.name}`,
      meta: { before: exists.name, after: row.name },
    });
    return NextResponse.json(row);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return NextResponse.json({ error: "部門名稱已存在" }, { status: 409 });
    }
    throw e;
  }
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
  const exists = await prisma.department.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "部門不存在" }, { status: 404 });
  }

  const [channels, documents, returns] = await Promise.all([
    prisma.channel.count({ where: { departmentId: id } }),
    prisma.inspectionDoc.count({ where: { departmentId: id } }),
    prisma.returnShipment.count({ where: { departmentId: id } }),
  ]);
  if (channels > 0 || documents > 0 || returns > 0) {
    return NextResponse.json(
      {
        error:
          `部門「${exists.name}」仍被使用，無法刪除。` +
          `（通路 ${channels}、單據 ${documents}、退貨 ${returns}）`,
      },
      { status: 409 },
    );
  }

  await prisma.department.delete({ where: { id } });
  await writeAudit({
    user: u,
    action: "department.delete",
    targetType: "Department",
    targetId: id,
    targetLabel: exists.name,
    summary: `刪除部門 ${exists.name}`,
  });
  return NextResponse.json({ ok: true });
}
