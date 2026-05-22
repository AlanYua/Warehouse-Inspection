/**
 * 通路主檔：列表與新增
 * 對應 URL：/api/channels
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

const listQuerySchema = z.object({
  departmentId: z.string().min(1),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
  withCount: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional(),
});

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "channels.view");
  if (f) return f;

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    withCount: url.searchParams.get("withCount") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const departmentId = parsed.data.departmentId.trim();
  const q = (parsed.data.q ?? "").trim();
  const take = parsed.data.limit ?? 200;
  const skip = parsed.data.offset ?? 0;
  const withCount =
    parsed.data.withCount === "1" || parsed.data.withCount === "true";

  // 預售部門一律不回傳通路資料（避免查詢量爆炸）
  const presaleDept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { name: true },
  });
  if (presaleDept?.name?.includes("預售")) {
    return withCount
      ? NextResponse.json({ rows: [], total: 0, limit: take, offset: skip })
      : NextResponse.json([]);
  }

  // 未帶關鍵字就不查，避免一次拉整個部門
  if (!q) {
    return withCount
      ? NextResponse.json({ rows: [], total: 0, limit: take, offset: skip })
      : NextResponse.json([]);
  }

  const where = {
    isActive: true,
    departmentId,
    OR: [
      { channelCode: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
      { phone: { contains: q, mode: "insensitive" as const } },
      { address: { contains: q, mode: "insensitive" as const } },
      { lingyueCode: { contains: q, mode: "insensitive" as const } },
      { department: { name: { contains: q, mode: "insensitive" as const } } },
    ],
  } satisfies Prisma.ChannelWhereInput;

  const rows = await prisma.channel.findMany({
    where,
    include: { department: true },
    orderBy: { channelCode: "asc" },
    take,
    skip,
  });
  if (!withCount) return NextResponse.json(rows);

  const total = await prisma.channel.count({ where });
  return NextResponse.json({ rows, total, limit: take, offset: skip });
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
