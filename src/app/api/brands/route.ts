/**
 * 品牌主檔：列表與新增
 * 對應 URL：/api/brands
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { forbidIfNoPermission, getSessionUser } from "@/lib/api-guard";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

const listQuerySchema = z.object({
  includeInactive: z
    .union([z.literal("1"), z.literal("true")])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSettingsAdmin = can(u.role, "settings.print");
  if (!isSettingsAdmin) {
    const f = forbidIfNoPermission(u.role, "products.view");
    if (f) return f;
  }

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    includeInactive: url.searchParams.get("includeInactive") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const includeInactive = isSettingsAdmin
    ? (parsed.data.includeInactive ?? false)
    : false;

  const rows = await prisma.brandOption.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(rows);
}

const createSchema = z.object({
  name: z.string().min(1),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;

  const body = createSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const name = body.data.name.trim();
  if (!name) return NextResponse.json({ error: "品牌名稱必填" }, { status: 400 });

  try {
    const row = await prisma.brandOption.create({ data: { name } });
    await writeAudit({
      user: u,
      action: "brand.create",
      targetType: "BrandOption",
      targetId: row.id,
      targetLabel: row.name,
      summary: `新增品牌 ${row.name}`,
    });
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "建立失敗";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

