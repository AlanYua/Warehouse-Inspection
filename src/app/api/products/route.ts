/**
 * 商品主檔：列表與新增
 * 對應 URL：/api/products
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
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
  brand: z.union([z.string(), z.array(z.string())]).optional(),
  withCount: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional(),
});

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "products.view");
  if (f) return f;

  const url = new URL(req.url);
  const brandParams = url.searchParams.getAll("brand");
  const raw = {
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    brand:
      brandParams.length > 1
        ? brandParams
        : brandParams.length === 1
          ? brandParams[0]
          : undefined,
    withCount: url.searchParams.get("withCount") ?? undefined,
  };
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const q = (parsed.data.q ?? "").trim();
  const take = parsed.data.limit ?? 200;
  const skip = parsed.data.offset ?? 0;
  const withCount =
    parsed.data.withCount === "1" || parsed.data.withCount === "true";

  const brandsRaw = parsed.data.brand;
  const brands = (
    Array.isArray(brandsRaw) ? brandsRaw : brandsRaw ? [brandsRaw] : []
  )
    .map((s) => s.trim())
    .filter(Boolean);

  const where = {
    isActive: true,
    ...(brands.length ? { brand: { in: brands, mode: "insensitive" as const } } : {}),
    ...(q
      ? {
          OR: [
            { productCode: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { barcode: { contains: q, mode: "insensitive" as const } },
            { brand: { contains: q, mode: "insensitive" as const } },
            { storageLocation: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  } satisfies Prisma.ProductWhereInput;

  const rows = await prisma.product.findMany({
    where,
    orderBy: { productCode: "asc" },
    take,
    skip,
  });
  if (!withCount) return NextResponse.json(rows);

  const total = await prisma.product.count({ where });
  return NextResponse.json({ rows, total, limit: take, offset: skip });
}

const createSchema = z.object({
  productCode: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  storageLocation: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "products.edit");
  if (f) return f;
  const body = createSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const toNull = (v: unknown) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
  };

  const desired = {
    productCode: body.data.productCode.trim(),
    name: body.data.name.trim(),
    brand: toNull(body.data.brand),
    barcode: toNull(body.data.barcode),
    storageLocation: toNull(body.data.storageLocation),
    isActive: true as const,
  };

  const activeBrands = await prisma.brandOption.findMany({
    where: { isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  if (activeBrands.length === 0) {
    return NextResponse.json(
      { error: "尚未設定品牌；請先到 /settings 建立品牌。" },
      { status: 400 },
    );
  }
  if (!desired.brand) {
    return NextResponse.json({ error: "品牌必填" }, { status: 400 });
  }
  const brandOk = activeBrands.some((b) => b.name === desired.brand);
  if (!brandOk) {
    return NextResponse.json(
      { error: `品牌「${desired.brand}」不存在或已停用` },
      { status: 400 },
    );
  }

  const existing = await prisma.product.findUnique({
    where: { productCode: desired.productCode },
  });

  if (!existing) {
    const row = await prisma.product.create({
      data: {
        productCode: desired.productCode,
        name: desired.name,
        brand: desired.brand ?? undefined,
        barcode: desired.barcode ?? undefined,
        storageLocation: desired.storageLocation ?? undefined,
        isActive: true,
      },
    });
    await writeAudit({
      user: u,
      action: "product.create",
      targetType: "Product",
      targetId: row.id,
      targetLabel: `${row.productCode} ${row.name}`,
      summary: `新增商品 ${row.productCode} ${row.name}`,
      meta: {
        productCode: row.productCode,
        name: row.name,
        brand: row.brand,
        barcode: row.barcode,
        storageLocation: row.storageLocation,
      },
    });
    return NextResponse.json(row, { headers: { "x-product-action": "created" } });
  }

  const cur = {
    name: existing.name,
    brand: existing.brand ?? null,
    barcode: existing.barcode ?? null,
    storageLocation: existing.storageLocation ?? null,
    isActive: existing.isActive,
  };

  const changed =
    cur.name !== desired.name ||
    cur.brand !== desired.brand ||
    cur.barcode !== desired.barcode ||
    cur.storageLocation !== desired.storageLocation ||
    cur.isActive !== true;

  if (!changed) {
    // 需求：同資料重送時，不報錯；回傳既有商品並標記 already_exists
    return NextResponse.json(existing, {
      headers: { "x-product-action": "already_exists" },
    });
  }

  const row = await prisma.product.update({
    where: { id: existing.id },
    data: {
      name: desired.name,
      brand: desired.brand,
      barcode: desired.barcode,
      storageLocation: desired.storageLocation,
      isActive: true,
    },
  });
  await writeAudit({
    user: u,
    action: "product.update",
    targetType: "Product",
    targetId: row.id,
    targetLabel: `${row.productCode} ${row.name}`,
    summary: `更新商品 ${row.productCode} ${row.name}`,
    meta: { before: cur, after: desired },
  });
  return NextResponse.json(row, { headers: { "x-product-action": "updated" } });
}
