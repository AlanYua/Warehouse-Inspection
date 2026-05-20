/**
 * 部門主檔：批次刪除
 * 對應 URL：/api/departments/batch-delete
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
  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;

  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const ids = [...new Set(body.data.ids.map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "需要 ids" }, { status: 400 });
  }

  const deps = await prisma.department.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      _count: {
        select: { channels: true, documents: true, returns: true },
      },
    },
  });

  const byId = Object.fromEntries(deps.map((d) => [d.id, d]));
  const missing = ids.filter((id) => !byId[id]);
  if (missing.length) {
    return NextResponse.json(
      { error: `找不到部門：${missing.join(", ")}` },
      { status: 404 },
    );
  }

  const blocked = deps
    .filter((d) => d._count.channels > 0 || d._count.documents > 0 || d._count.returns > 0)
    .map(
      (d) =>
        `「${d.name}」(通路 ${d._count.channels}、單據 ${d._count.documents}、退貨 ${d._count.returns})`,
    );
  if (blocked.length) {
    return NextResponse.json(
      { error: `以下部門仍被使用，無法刪除：\n${blocked.join("\n")}` },
      { status: 409 },
    );
  }

  const result = await prisma.department.deleteMany({
    where: { id: { in: ids } },
  });

  await writeAudit({
    user: u,
    action: "department.batch-delete",
    targetType: "Department",
    summary: `批次刪除部門 ${result.count} 筆`,
    meta: { count: result.count, names: deps.map((d) => d.name) },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}

