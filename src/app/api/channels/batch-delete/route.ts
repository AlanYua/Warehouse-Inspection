/**
 * 通路主檔：批次刪除
 * 對應 URL：/api/channels/batch-delete
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  ids: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "channels.delete");
  if (f) return f;
  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const result = await prisma.channel.updateMany({
    where: { id: { in: body.data.ids } },
    data: { isActive: false },
  });
  await writeAudit({
    user: u,
    action: "channel.batch-delete",
    targetType: "Channel",
    summary: `批次停用通路 ${result.count} 筆`,
    meta: { count: result.count, ids: body.data.ids.slice(0, 100) },
  });
  return NextResponse.json({ ok: true });
}
