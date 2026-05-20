/**
 * 商品主檔：單筆維護
 * 對應 URL：/api/products/[id]
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";
import { Role } from "@prisma/client";

const patchSchema = z.object({
  productCode: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  brand: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  storageLocation: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  if (u.role === Role.WAREHOUSE) {
    const f = forbidIfNoPermission(u.role, "products.storageOnly");
    if (f) return f;
    const allowed: Record<string, unknown> = {};
    if (body.data.storageLocation !== undefined) {
      allowed.storageLocation = body.data.storageLocation;
    }
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json(
        { error: "倉庫僅可修改儲位" },
        { status: 403 },
      );
    }
    const row = await prisma.product.update({
      where: { id },
      data: allowed,
    });
    await writeAudit({
      user: u,
      action: "product.update",
      targetType: "Product",
      targetId: row.id,
      targetLabel: `${row.productCode} ${row.name}`,
      summary: `修改商品儲位 → ${row.storageLocation ?? "（清空）"}`,
      meta: allowed,
    });
    return NextResponse.json(row);
  }

  const f = forbidIfNoPermission(u.role, "products.edit");
  if (f) return f;
  const row = await prisma.product.update({
    where: { id },
    data: body.data,
  });
  await writeAudit({
    user: u,
    action: "product.update",
    targetType: "Product",
    targetId: row.id,
    targetLabel: `${row.productCode} ${row.name}`,
    summary: `編輯商品 ${row.productCode} ${row.name}`,
    meta: body.data as Record<string, unknown>,
  });
  return NextResponse.json(row);
}
