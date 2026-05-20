/**
 * 單據類型主檔：列表與新增
 * 對應 URL：/api/document-types
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
  const ok = can(u.role, "documents.view") || can(u.role, "settings.print");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.documentTypeOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(rows);
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  flow: z.enum(["OUT", "IN"]).optional(),
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
    const row = await prisma.documentTypeOption.create({
      data: { name, sortOrder: 0, flow: parsed.data.flow ?? "OUT" },
    });
    await writeAudit({
      user: u,
      action: "doctype.create",
      targetType: "DocumentTypeOption",
      targetId: row.id,
      targetLabel: row.name,
      summary: `新增單據類型 ${row.name}（${row.flow}）`,
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "名稱已存在" }, { status: 409 });
  }
}
