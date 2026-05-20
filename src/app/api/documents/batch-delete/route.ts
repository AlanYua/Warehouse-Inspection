/**
 * 驗收單據：批次刪除
 * 對應 URL：/api/documents/batch-delete
 */

import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidIfNoPermission, getSessionUser } from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";
import { canDeleteDocument } from "@/lib/documents/delete-guard";
import { z } from "zod";

const bodySchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.delete");
  if (f) return f;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "請提供 documentIds" }, { status: 400 });
  }

  const documentIds = [...new Set(parsed.data.documentIds.map((x) => x.trim()))].filter(
    Boolean,
  );
  if (documentIds.length === 0) {
    return NextResponse.json({ error: "請提供 documentIds" }, { status: 400 });
  }

  const found = await prisma.inspectionDoc.findMany({
    where: { id: { in: documentIds } },
    select: {
      id: true,
      documentNumber: true,
      status: true,
      stockedAt: true,
    },
  });
  if (found.length !== documentIds.length) {
    const have = new Set(found.map((d) => d.id));
    const missing = documentIds.filter((id) => !have.has(id));
    return NextResponse.json(
      { error: "部分單據不存在", missingIds: missing },
      { status: 400 },
    );
  }

  if (u.role === Role.WAREHOUSE_SUPERVISOR) {
    const blocked = found.filter((d) => !canDeleteDocument(u.role, d).ok);
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: "已出貨或已入庫單據不可刪除",
          blockedDocumentNumbers: blocked
            .map((d) => d.documentNumber)
            .slice(0, 20),
        },
        { status: 403 },
      );
    }
  }

  const del = await prisma.inspectionDoc.deleteMany({
    where: { id: { in: documentIds } },
  });

  if (del.count !== documentIds.length) {
    return NextResponse.json(
      { error: "刪除筆數異常，請重新整理後再試" },
      { status: 409 },
    );
  }

  await writeAudit({
    user: u,
    action: "doc.batch-delete",
    targetType: "InspectionDoc",
    summary: `批次刪除 ${del.count} 筆單據`,
    meta: {
      count: del.count,
      documentNumbers: found.map((d) => d.documentNumber).slice(0, 100),
    },
  });

  return NextResponse.json({ ok: true, count: del.count });
}

