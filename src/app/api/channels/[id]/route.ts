/**
 * 通路主檔：單筆查詢、更新、刪除
 * 對應 URL：/api/channels/[id]
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
  channelCode: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lingyueCode: z.string().nullable().optional(),
  departmentId: z.string().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "channels.edit");
  if (f) return f;
  const { id } = await ctx.params;
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const row = await prisma.channel.update({
    where: { id },
    data: body.data,
    include: { department: true },
  });
  await writeAudit({
    user: u,
    action: "channel.update",
    targetType: "Channel",
    targetId: row.id,
    targetLabel: `${row.channelCode} ${row.name}`,
    summary: `編輯通路 ${row.channelCode} ${row.name}`,
    meta: body.data as Record<string, unknown>,
  });
  return NextResponse.json(row);
}
