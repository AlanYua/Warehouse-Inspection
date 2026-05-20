/**
 * 通路主檔：列表與新增
 * 對應 URL：/api/channels
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "channels.view");
  if (f) return f;

  const url = new URL(req.url);
  const departmentId = (url.searchParams.get("departmentId") ?? "").trim();

  // 防止一次拉全量資料把前端打爆：未指定部門就不查
  if (!departmentId) return NextResponse.json([]);

  // 預售部門一律不回傳通路資料（避免查詢量爆炸）
  const presaleDept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { name: true },
  });
  if (presaleDept?.name?.includes("預售")) return NextResponse.json([]);

  const rows = await prisma.channel.findMany({
    where: { isActive: true, departmentId },
    include: { department: true },
    orderBy: { channelCode: "asc" },
  });
  return NextResponse.json(rows);
}

const createSchema = z.object({
  channelCode: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  lingyueCode: z.string().optional().nullable(),
  departmentId: z.string().min(1),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "channels.edit");
  if (f) return f;
  const body = createSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const channelCode = body.data.channelCode.trim();
  const existing = await prisma.channel.findUnique({
    where: { channelCode },
    select: {
      id: true,
      channelCode: true,
      name: true,
      departmentId: true,
      phone: true,
      address: true,
      lingyueCode: true,
      isActive: true,
    },
  });

  const next = {
    channelCode,
    name: body.data.name,
    departmentId: body.data.departmentId,
    phone: body.data.phone ?? undefined,
    address: body.data.address ?? undefined,
    lingyueCode: body.data.lingyueCode ?? undefined,
    isActive: true,
  };

  if (!existing) {
    const row = await prisma.channel.create({
      data: next,
      include: { department: true },
    });
    await writeAudit({
      user: u,
      action: "channel.create",
      targetType: "Channel",
      targetId: row.id,
      targetLabel: `${row.channelCode} ${row.name}`,
      summary: `新增通路 ${row.channelCode} ${row.name}`,
      meta: { channelCode: row.channelCode, name: row.name, departmentId: row.departmentId },
    });
    return NextResponse.json({ ok: true, action: "created", row });
  }

  const needUpdate =
    existing.channelCode !== next.channelCode ||
    existing.name !== next.name ||
    existing.departmentId !== next.departmentId ||
    (existing.phone ?? "") !== (next.phone ?? "") ||
    (existing.address ?? "") !== (next.address ?? "") ||
    (existing.lingyueCode ?? "") !== (next.lingyueCode ?? "") ||
    existing.isActive !== next.isActive;

  if (!needUpdate) {
    const row = await prisma.channel.findUnique({
      where: { id: existing.id },
      include: { department: true },
    });
    return NextResponse.json({
      ok: true,
      action: "unchanged",
      message: "通路已建立",
      row,
    });
  }

  const row = await prisma.channel.update({
    where: { id: existing.id },
    data: next,
    include: { department: true },
  });
  await writeAudit({
    user: u,
    action: "channel.update",
    targetType: "Channel",
    targetId: row.id,
    targetLabel: `${row.channelCode} ${row.name}`,
    summary: `更新通路 ${row.channelCode} ${row.name}`,
    meta: {
      before: {
        channelCode: existing.channelCode,
        name: existing.name,
        departmentId: existing.departmentId,
        phone: existing.phone,
        address: existing.address,
        lingyueCode: existing.lingyueCode,
        isActive: existing.isActive,
      },
      after: next,
    },
  });
  return NextResponse.json({ ok: true, action: "updated", row });
}
