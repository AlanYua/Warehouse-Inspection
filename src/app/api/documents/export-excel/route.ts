/**
 * 驗收單據：匯出 Excel 明細
 * 對應 URL：/api/documents/export-excel
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildDocumentsDetailWorkbook,
  exportFilenameBase,
} from "@/lib/export/documents-excel";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { syncLineStorageFromProducts } from "@/lib/documents/syncLineStorageFromProducts";

const bodySchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fg = forbidIfNoPermission(u.role, "documents.view");
  if (fg) return fg;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "documentIds 必填，最多 200 筆" },
      { status: 400 },
    );
  }

  const { documentIds } = parsed.data;

  const docs = await prisma.inspectionDoc.findMany({
    where: { id: { in: documentIds } },
    include: {
      department: true,
      lines: { orderBy: [{ productCode: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ documentNumber: "asc" }, { channelCode: "asc" }],
  });

  if (docs.length === 0) {
    return NextResponse.json({ error: "找不到單據" }, { status: 404 });
  }

  const allLines = docs.flatMap((d) => d.lines);
  await syncLineStorageFromProducts(allLines);
  const docsForExport = await prisma.inspectionDoc.findMany({
    where: { id: { in: documentIds } },
    include: {
      department: true,
      lines: { orderBy: [{ productCode: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ documentNumber: "asc" }, { channelCode: "asc" }],
  });

  const bytes = await buildDocumentsDetailWorkbook(docsForExport);
  const name = `${exportFilenameBase()}.xlsx`;
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);

  return new NextResponse(new Blob([ab]), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
