/**
 * 商品主檔：Excel 匯入
 * 對應 URL：/api/products/import
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import {
  parseWorksheetRows,
  resolveProductColumns,
  strCell,
} from "@/lib/excel-master-import";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "products.edit");
  if (f) return f;

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart 檔案" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "檔案過大" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  let headers: string[];
  let rows: string[][];
  try {
    const parsed = await parseWorksheetRows(buf);
    headers = parsed.headers;
    rows = parsed.rows;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "無法讀取 Excel" },
      { status: 400 },
    );
  }

  const cols = resolveProductColumns(headers);
  if (!cols) {
    return NextResponse.json(
      {
        error:
          "表頭需含：貨品編號（或貨號）、名稱（或品名）、條碼、品牌；儲位可省略",
      },
      { status: 400 },
    );
  }

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
  if (cols.brand === undefined) {
    return NextResponse.json(
      { error: "已啟用品牌檢核：匯入表頭需包含「品牌」欄位" },
      { status: 400 },
    );
  }

  let ok = 0;
  let skip = 0;
  const errs: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const productCode = strCell(r[cols.productCode]);
    const name = strCell(r[cols.name]);
    const barcode = strCell(r[cols.barcode]);
    const brand = strCell(r[cols.brand]) || null;
    const storageLocation =
      cols.storageLocation !== undefined
        ? strCell(r[cols.storageLocation]) || null
        : null;

    const rowLabel = `第 ${i + 2} 列`;
    if (!productCode && !name && !barcode) {
      const hasStorage =
        cols.storageLocation !== undefined &&
        Boolean(strCell(r[cols.storageLocation]));
      if (hasStorage) {
        errs.push(`${rowLabel}：缺貨號／名稱／條碼（僅儲位可為空）`);
        if (errs.length >= 40) break;
      } else {
        skip++;
      }
      continue;
    }
    if (!productCode || !name || !barcode) {
      errs.push(
        `${rowLabel}：貨號、品名、條碼皆必填（儲位可空白）`,
      );
      if (errs.length >= 40) break;
      continue;
    }
    if (!brand) {
      errs.push(`${rowLabel}：品牌必填（請先到 /settings 建立品牌）`);
      if (errs.length >= 40) break;
      continue;
    }
    const brandOk = activeBrands.some((b) => b.name === brand);
    if (!brandOk) {
      errs.push(`${rowLabel}：品牌「${brand}」不存在或已停用`);
      if (errs.length >= 40) break;
      continue;
    }

    try {
      await prisma.product.upsert({
        where: { productCode },
        create: {
          productCode,
          name,
          barcode,
          brand,
          storageLocation: storageLocation ?? undefined,
        },
        update: {
          name,
          barcode,
          brand,
          storageLocation,
          isActive: true,
        },
      });
      ok++;
    } catch (e) {
      errs.push(`第 ${i + 2} 列：${e instanceof Error ? e.message : "寫入失敗"}`);
      if (errs.length >= 40) break;
    }
  }

  if (ok > 0 || errs.length > 0) {
    await writeAudit({
      user: u,
      action: "product.import",
      targetType: "Product",
      summary: `匯入商品（成功 ${ok}、錯誤 ${errs.length}、空列 ${skip}）`,
      meta: {
        filename: file.name,
        imported: ok,
        skippedEmpty: skip,
        errorCount: errs.length,
        rowCount: rows.length,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    imported: ok,
    skippedEmpty: skip,
    errors: errs,
    rowCount: rows.length,
  });
}
