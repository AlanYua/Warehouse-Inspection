/**
 * 商品主檔：批次更新儲位
 * 對應 URL：/api/products/batch-storage
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-guard";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      storageLocation: z.string().nullable(),
    }),
  ),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(u.role, "products.storageOnly") && !can(u.role, "products.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  for (const uu of body.data.updates) {
    await prisma.product.update({
      where: { id: uu.id },
      data: { storageLocation: uu.storageLocation },
    });
  }
  await writeAudit({
    user: u,
    action: "product.batch-storage",
    targetType: "Product",
    summary: `批次更新商品儲位 ${body.data.updates.length} 筆`,
    meta: { count: body.data.updates.length },
  });
  return NextResponse.json({ ok: true });
}
