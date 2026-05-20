/**
 * 驗收單據：列表查詢
 * 對應 URL：/api/documents
 */

import { NextResponse } from "next/server";
import { DocumentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";

const querySchema = z.object({
  q: z.string().optional(),
  status: z
    .union([z.nativeEnum(DocumentStatus), z.literal("STOCKED")])
    .optional(),
  includeShipped: z
    .enum(["0", "1"])
    .transform((v) => v === "1")
    .optional(),
  departmentId: z.string().optional(),
  documentType: z.string().optional(),
  flow: z.enum(["OUT", "IN"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(50_000).optional(),
});

function parseYmd(s: string | null): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // 確保是 YYYY-MM-DD（避免 new Date("...") 吃到時區/瀏覽器差異）
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }
  // 用 UTC 邊界，再轉成 Date 供 Prisma（Postgres timestamptz）
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fg = forbidIfNoPermission(u.role, "documents.view");
  if (fg) return fg;

  const url = new URL(req.url);
  const raw = {
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    includeShipped: url.searchParams.get("includeShipped") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    documentType: url.searchParams.get("documentType") ?? undefined,
    flow: url.searchParams.get("flow") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  };
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // contains 搜尋在大表上非常貴；短字串（1~2 字）通常命中率低但掃描成本高
  const q0 = (parsed.data.q ?? "").trim();
  const q = q0.length >= 3 ? q0 : "";
  const status = parsed.data.status;
  const includeShipped = parsed.data.includeShipped ?? false;
  const departmentId = (parsed.data.departmentId ?? "").trim();
  const documentType = (parsed.data.documentType ?? "").trim();
  const flow = parsed.data.flow;
  const take = parsed.data.limit ?? 50;
  const skip = parsed.data.offset ?? 0;

  const from = parseYmd(parsed.data.dateFrom ?? null);
  const to0 = parseYmd(parsed.data.dateTo ?? null);
  const to = to0 ? new Date(to0.getTime() + 24 * 60 * 60 * 1000 - 1) : null; // inclusive end-of-day

  const where: Prisma.InspectionDocWhereInput = {};
  if (status === "STOCKED") {
    where.AND = [
      { status: DocumentStatus.COMPLETED },
      { stockedAt: { not: null } },
    ];
  } else if (status === DocumentStatus.COMPLETED) {
    // 「已完成」只保留尚未入庫的完成單，已入庫請走 STOCKED
    where.AND = [
      { status: DocumentStatus.COMPLETED },
      {
        NOT: {
          AND: [
            { stockedAt: { not: null } },
          ],
        },
      },
    ];
  } else if (status) {
    where.status = status;
  } else if (!includeShipped) {
    where.AND = [
      { status: { not: DocumentStatus.SHIPPED } },
      {
        NOT: {
          AND: [
            { status: DocumentStatus.COMPLETED },
            { stockedAt: { not: null } },
          ],
        },
      },
    ];
  }
  if (departmentId) where.departmentId = departmentId;
  if (documentType) where.documentType = documentType;
  if (flow) where.flow = flow;

  if (from || to) {
    // 有單據日期者依 documentDate；無單據日期則依 createdAt（與前端 tooltip 一致）
    where.OR = [
      {
        documentDate: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      },
      {
        AND: [
          { documentDate: null },
          {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          },
        ],
      },
    ];
  }

  if (q) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { documentNumber: { contains: q, mode: "insensitive" } },
          { documentType: { contains: q, mode: "insensitive" } },
          { channelCode: { contains: q, mode: "insensitive" } },
          { counterpartyName: { contains: q, mode: "insensitive" } },
          { logisticsNo: { contains: q, mode: "insensitive" } },
          { creatorName: { contains: q, mode: "insensitive" } },
          { lingyueCode: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const rows = await prisma.inspectionDoc.findMany({
    where,
    include: {
      department: { select: { name: true } },
      lockedBy: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take,
    skip,
  });

  return NextResponse.json(rows);
}
