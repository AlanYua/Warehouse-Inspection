/**
 * 操作紀錄：列表（支援關鍵字、動作、人員、時間區間、分頁）
 * 對應 URL：/api/audit-logs
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { forbidIfNoPermission, getSessionUser } from "@/lib/api-guard";
import type { Prisma } from "@prisma/client";

const querySchema = z.object({
  q: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "audit.view");
  if (f) return f;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { q, action, userId, targetType, targetId, from, to } = parsed.data;
  const take = parsed.data.take ?? 50;
  const cursor = parsed.data.cursor;

  const range: Prisma.DateTimeFilter = {};
  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "from 格式不正確" }, { status: 400 });
    }
    range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "to 格式不正確" }, { status: 400 });
    }
    range.lte = d;
  }

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetId ? { targetId } : {}),
    ...(Object.keys(range).length ? { createdAt: range } : {}),
    ...(q && q.trim()
      ? {
          OR: [
            { summary: { contains: q.trim(), mode: "insensitive" } },
            { targetLabel: { contains: q.trim(), mode: "insensitive" } },
            { userName: { contains: q.trim(), mode: "insensitive" } },
            { username: { contains: q.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      userId: true,
      username: true,
      userName: true,
      role: true,
      action: true,
      targetType: true,
      targetId: true,
      targetLabel: true,
      summary: true,
      meta: true,
      ip: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return NextResponse.json({ items, nextCursor });
}
