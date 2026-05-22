/**
 * 部門主檔：列表與新增
 * 對應 URL：/api/departments
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getSessionUser } from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // 部門屬於前台選單/主檔；只要有任何一個常用頁面權限就允許讀取
  const ok =
    can(u.role, "documents.view") ||
    can(u.role, "channels.view") ||
    can(u.role, "products.view") ||
    can(u.role, "dashboard.view") ||
    can(u.role, "reports.shipping-history.view") ||
    can(u.role, "settings.print");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.department.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(rows);
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(u.role, "settings.print")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const name = parsed.data.name.trim().replace(/\s+/g, " ");
  if (!name) {
    return NextResponse.json({ error: "名稱不可空白" }, { status: 400 });
  }
  try {
    const row = await prisma.department.create({ data: { name } });
    await writeAudit({
      user: u,
      action: "department.create",
      targetType: "Department",
      targetId: row.id,
      targetLabel: row.name,
      summary: `新增部門 ${row.name}`,
    });
    return NextResponse.json(row);
  } catch {
    // Prisma P2002 也可細分，但這裡用簡單訊息就夠用
    return NextResponse.json({ error: "部門名稱已存在" }, { status: 409 });
  }
}
