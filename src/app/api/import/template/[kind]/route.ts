/**
 * 下載匯入用 Excel 範本
 * 對應 URL：/api/import/template/[kind]
 */

import { NextResponse } from "next/server";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { buildImportTemplateXlsx } from "@/lib/excel-template-build";
import { DOCUMENT_IMPORT_HEADERS } from "@/lib/import/excel";

export const runtime = "nodejs";

const KIND_CONFIG = {
  documents: {
    permission: "documents.import" as const,
    headers: [...DOCUMENT_IMPORT_HEADERS],
    filename: "單據匯入範本.xlsx",
  },
  products: {
    permission: "products.edit" as const,
    headers: ["貨品編號", "名稱", "品牌", "國際條碼", "儲位"],
    filename: "商品主檔匯入範本.xlsx",
  },
  channels: {
    permission: "channels.edit" as const,
    headers: ["通路代碼", "名稱", "部門", "電話", "地址", "凌越代碼"],
    filename: "通路主檔匯入範本.xlsx",
  },
} as const;

type Kind = keyof typeof KIND_CONFIG;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { kind: raw } = await ctx.params;
  if (!(raw in KIND_CONFIG)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const kind = raw as Kind;
  const cfg = KIND_CONFIG[kind];
  const f = forbidIfNoPermission(u.role, cfg.permission);
  if (f) return f;

  const buf = await buildImportTemplateXlsx(cfg.headers);
  const encoded = encodeURIComponent(cfg.filename);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
    },
  });
}
