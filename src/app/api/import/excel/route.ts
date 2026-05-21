/**
 * 通用：Excel 檔解析（單據等）
 * 對應 URL：/api/import/excel
 */

import { DocumentFlow, DocumentSource, DocumentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { parseDocumentsExcel } from "@/lib/import/excel";
import { applyExternalRows } from "@/lib/sync/applyExternalRows";
import ExcelJS from "exceljs";
import { log } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normBarcode(s: unknown): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-z]/g, "");
}

function keyLabel(k: {
  documentNumber: string;
  documentType: string;
  channelCode: string;
}) {
  return `${k.documentNumber}+${k.documentType}+${k.channelCode || "—"}`;
}

type ImportDetail = {
  documentNumber: string;
  documentType: string;
  channelCode: string;
  status: "CREATED" | "OVERWRITTEN" | "ERROR";
  reason?: string;
};

function keyStrOf(k: {
  documentNumber: string;
  documentType: string;
  channelCode: string;
}) {
  return `${k.documentNumber}\u0001${k.documentType}\u0001${k.channelCode}`;
}

const statusZh = {
  PENDING: "未完成",
  INSPECTING: "驗收中",
  COMPLETED: "已完成",
  SHIPPED: "已出貨",
} as const;

async function tryExtractOrderNoFromExcel(buf: Buffer): Promise<string | null> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const sheet = wb.worksheets[0];
    if (!sheet) return null;
    const headerRow = sheet.getRow(1);
    let docNoCol: number | null = null;
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (docNoCol != null) return;
      const h = norm(cell.text);
      if (h === "單據號碼") docNoCol = colNumber;
    });
    if (docNoCol == null) return null;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const s = norm(row.getCell(docNoCol).text || row.getCell(docNoCol).value);
      if (s) return s;
    }
    return null;
  } catch {
    return null;
  }
}

function summarizeOrderNo(documentNumbers: string[]): string {
  const uniq = Array.from(new Set(documentNumbers.map((s) => s.trim()).filter(Boolean)));
  if (uniq.length === 0) return "—";
  if (uniq.length === 1) return uniq[0]!;
  // 同一檔多張單據：用摘要避免欄位爆長
  return `${uniq[0]}…(+${uniq.length - 1})`;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(`import:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "匯入操作過於頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.import");
  if (f) return f;

  const deptOpts = await prisma.department.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const allowedDepartments = deptOpts.map((d) => d.name);
  if (allowedDepartments.length === 0) {
    return NextResponse.json(
      { error: "尚未建立部門，請先至「設定」新增部門後再匯入。" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "需要檔案 file" }, { status: 400 });
  }
  // 50k 列 excel 也常見，但避免有人丟超大檔把 server 記憶體打爆
  const maxBytes = 60 * 1024 * 1024; // 60MB
  if (typeof file.size === "number" && file.size > maxBytes) {
    return NextResponse.json(
      { error: `檔案過大（>${maxBytes} bytes），請拆檔後再匯入` },
      { status: 413 },
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());

  // 單據匯入需要通路/商品主檔用來補齊與對照；若主檔為空，匯入只會產生不完整資料或造成後續作業混亂。
  // 這裡在讀完檔案後才檢查，讓錯誤訊息能附上 Excel 內的單號（方便使用者定位是哪一份檔）。
  const [channelCount, productCount] = await Promise.all([
    prisma.channel.count(),
    prisma.product.count(),
  ]);
  if (channelCount === 0 || productCount === 0) {
    const missing: string[] = [];
    if (channelCount === 0) missing.push("通路");
    if (productCount === 0) missing.push("商品");
    const orderNo = await tryExtractOrderNoFromExcel(buf);
    const msg = `尚未建立${missing.join("、")}主檔，請先至「主檔」匯入/新增後再匯入單據。${
      orderNo ? `（單號：${orderNo}）` : ""
    }`;
    await prisma.importLog.create({
      data: {
        filename: file.name,
        source: "EXCEL",
        orderNo: orderNo || "—",
        successCount: 0,
        errorCount: 1,
        message: msg,
        uploader: u.name?.trim() || u.username || null,
      },
    });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const typeOpts = await prisma.documentTypeOption.findMany({
    select: { name: true, flow: true },
    orderBy: { name: "asc" },
  });
  const allowedDocumentTypes = typeOpts.map((t) => t.name);
  const flowByDocumentType = Object.fromEntries(
    typeOpts.map((t) => [
      t.name,
      t.flow === DocumentFlow.IN ? "IN" : "OUT",
    ]),
  ) as Record<string, "OUT" | "IN">;
  let rows;
  try {
    rows = await parseDocumentsExcel(buf, {
      defaultCreatorName: u.name?.trim() || u.username || null,
      allowedDocumentTypes:
        allowedDocumentTypes.length > 0 ? allowedDocumentTypes : undefined,
      flowByDocumentType,
      allowedDepartments,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log.error("import-excel-parse", { file: file.name, error: errMsg });
    const orderNo = await tryExtractOrderNoFromExcel(buf);
    await prisma.importLog.create({
      data: {
        filename: file.name,
        source: "EXCEL",
        orderNo: orderNo || "—",
        successCount: 0,
        errorCount: 1,
        message: errMsg,
        uploader: u.name?.trim() || u.username || null,
      },
    });
    return NextResponse.json({ error: errMsg }, { status: 400 });
  }

  // === 匯入前驗證（依 Key：單據號碼 + 單據類型 + 通路代碼） ===
  type Key = { documentNumber: string; documentType: string; channelCode: string };
  const toKey = (r: (typeof rows)[number]): Key => {
    const documentNumber = norm(r.documentNumber);
    const documentType = norm(r.documentType);
    const channelCode = norm(r.channelCode);
    return { documentNumber, documentType, channelCode };
  };

  const validationErrors: string[] = [];
  // 同步維護「依 Key 分組」的錯誤原因，給前端做每張單據的狀況顯示
  const validationErrorsByKey = new Map<
    string,
    { key: Key; reasons: string[] }
  >();
  const pushKeyError = (key: Key, reason: string) => {
    const ks = keyStrOf(key);
    const slot =
      validationErrorsByKey.get(ks) ?? { key, reasons: [] };
    slot.reasons.push(reason);
    validationErrorsByKey.set(ks, slot);
    validationErrors.push(`${keyLabel(key)}：${reason}`);
  };

  // 0) 通路代碼必須存在於通路主檔
  const channelCodes = Array.from(
    new Set(rows.map((r) => norm(r.channelCode)).filter(Boolean)),
  );
  if (channelCodes.length > 0) {
    const found = await prisma.channel.findMany({
      where: { channelCode: { in: channelCodes } },
      select: {
        channelCode: true,
        department: { select: { name: true } },
      },
    });
    const foundSet = new Set(found.map((c) => norm(c.channelCode)));
    const channelDeptByCode = new Map(
      found.map((c) => [norm(c.channelCode), norm(c.department.name)]),
    );
    for (const r of rows) {
      const code = norm(r.channelCode);
      if (!code) continue;
      if (!foundSet.has(code)) {
        pushKeyError(toKey(r), `通路代碼「${code}」不存在於通路主檔`);
        if (validationErrors.length >= 200) break;
        continue;
      }
      const excelDept = norm(r.departmentName ?? "");
      const channelDept = channelDeptByCode.get(code) ?? "";
      if (excelDept && channelDept && excelDept !== channelDept) {
        pushKeyError(
          toKey(r),
          `部門「${excelDept}」與通路主檔中通路「${code}」所屬部門「${channelDept}」不符`,
        );
        if (validationErrors.length >= 200) break;
      }
    }
  }

  // 0.5) 商品（貨號/條碼）必須至少其一存在於商品主檔
  const productCodes = Array.from(
    new Set(
      rows
        .flatMap((r) => r.lines.map((l) => norm(l.productCode)))
        .filter(Boolean),
    ),
  );
  const barcodes = Array.from(
    new Set(
      rows
        .flatMap((r) => r.lines.map((l) => normBarcode(l.barcode)))
        .filter(Boolean),
    ),
  );
  if (productCodes.length > 0 || barcodes.length > 0) {
    const products = await prisma.product.findMany({
      where: {
        OR: [
          ...(productCodes.length ? [{ productCode: { in: productCodes } }] : []),
          ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
        ],
      },
      select: { productCode: true, barcode: true },
    });
    const codeSet = new Set(products.map((p) => norm(p.productCode)));
    const barcodeSet = new Set(products.map((p) => normBarcode(p.barcode)));

    for (const r of rows) {
      const k = toKey(r);
      for (const l of r.lines) {
        const code = norm(l.productCode);
        const bc = normBarcode(l.barcode);
        const ok = (code && codeSet.has(code)) || (bc && barcodeSet.has(bc));
        if (!ok) {
          pushKeyError(
            k,
            `商品不存在於商品主檔（貨品編號：${code || "—"}，國際條碼：${bc || "—"}）`,
          );
          if (validationErrors.length >= 200) break;
        }
      }
      if (validationErrors.length >= 200) break;
    }
  }

  // 1) 同一張 Key 內不得有重複品項（以 productCode / barcode 任一重複即算）
  const seenByKey = new Map<
    string,
    { codes: Set<string>; barcodes: Set<string> }
  >();
  for (const r of rows) {
    const k = toKey(r);
    const kStr = `${k.documentNumber}\u0001${k.documentType}\u0001${k.channelCode}`;
    const state =
      seenByKey.get(kStr) ?? { codes: new Set<string>(), barcodes: new Set<string>() };
    for (const l of r.lines) {
      const code = norm(l.productCode);
      const bc = norm(l.barcode);
      if (code && state.codes.has(code)) {
        pushKeyError(k, `同一張單據內品項重複（貨品編號：${code}）`);
        continue;
      }
      if (bc && state.barcodes.has(bc)) {
        pushKeyError(k, `同一張單據內品項重複（國際條碼：${bc}）`);
        continue;
      }
      if (code) state.codes.add(code);
      if (bc) state.barcodes.add(bc);
    }
    seenByKey.set(kStr, state);
  }

  // 2) DB 已存在同 Key：未完成可覆蓋（先刪舊資料）；其餘狀態禁止覆蓋
  const uniqKeys = Array.from(
    new Map(rows.map((r) => {
      const k = toKey(r);
      const kStr = `${k.documentNumber}\u0001${k.documentType}\u0001${k.channelCode}`;
      return [kStr, k] as const;
    })).values(),
  );

  const existingDocs: {
    id: string;
    documentNumber: string;
    documentType: string;
    counterpartyName: string | null;
    channelCode: string | null;
    status: DocumentStatus;
  }[] = [];
  const chunkSize = 200;
  for (let i = 0; i < uniqKeys.length; i += chunkSize) {
    const chunk = uniqKeys.slice(i, i + chunkSize);
    const found = await prisma.inspectionDoc.findMany({
      where: {
        OR: chunk.map((k) => ({
          documentNumber: k.documentNumber,
          documentType: k.documentType,
          channelCode: k.channelCode || null,
        })),
      },
      select: {
        id: true,
        documentNumber: true,
        documentType: true,
        counterpartyName: true,
        channelCode: true,
        status: true,
      },
    });
    existingDocs.push(...found);
  }

  const deletableIds: string[] = [];
  // 記錄哪些 Key 是「覆蓋原有」（PENDING 被刪掉重建）
  const overwriteKeySet = new Set<string>();
  for (const d of existingDocs) {
    const k: Key = {
      documentNumber: norm(d.documentNumber),
      documentType: norm(d.documentType),
      channelCode: norm(d.channelCode) || "",
    };
    const st = d.status as keyof typeof statusZh;
    if (st === "PENDING") {
      deletableIds.push(d.id);
      overwriteKeySet.add(keyStrOf(k));
      continue;
    }
    pushKeyError(
      k,
      `已存在舊資料且狀態為「${statusZh[st] ?? d.status}」，請先通知倉庫主管刪除舊資料後再匯入。`,
    );
  }

  const validationErrorByKey = new Map<string, string[]>();
  for (const [ks, slot] of validationErrorsByKey) {
    validationErrorByKey.set(ks, slot.reasons);
  }

  // 有錯的 Key 不落庫；其他 Key 照常匯入，避免一筆錯誤拖垮整檔。
  const invalidKeySet = new Set(validationErrorsByKey.keys());
  const validRows = rows.filter((r) => !invalidKeySet.has(keyStrOf(toKey(r))));
  const validKeySet = new Set(validRows.map((r) => keyStrOf(toKey(r))));
  const validDeletableIds = existingDocs
    .filter((d) => {
      const k: Key = {
        documentNumber: norm(d.documentNumber),
        documentType: norm(d.documentType),
        channelCode: norm(d.channelCode) || "",
      };
      const st = d.status as keyof typeof statusZh;
      return st === "PENDING" && validKeySet.has(keyStrOf(k));
    })
    .map((d) => d.id);
  const validOverwriteKeySet = new Set(
    Array.from(overwriteKeySet).filter((ks) => validKeySet.has(ks)),
  );

  if (validDeletableIds.length > 0) {
    await prisma.inspectionDoc.deleteMany({
      where: { id: { in: validDeletableIds } },
    });
  }

  const orderNo = summarizeOrderNo(rows.map((r) => r.documentNumber));
  const { created, updated, errors, errorDetails } = await applyExternalRows(
    validRows,
    DocumentSource.EXCEL,
    prisma,
    { chunkDocs: 80, chunkLines: 2000, transactionTimeoutMs: 180_000 },
  );

  // 組裝每張單據的詳細結果（成功 / 覆蓋原有 / 錯誤）
  const errorByKey = new Map(validationErrorByKey);
  for (const e of errorDetails) {
    const ks = keyStrOf({
      documentNumber: e.documentNumber,
      documentType: e.documentType,
      channelCode: e.channelCode,
    });
    const arr = errorByKey.get(ks) ?? [];
    arr.push(e.reason);
    errorByKey.set(ks, arr);
  }
  const details: ImportDetail[] = uniqKeys.map((k) => {
    const ks = keyStrOf(k);
    const errReasons = errorByKey.get(ks);
    if (errReasons && errReasons.length > 0) {
      return {
        documentNumber: k.documentNumber,
        documentType: k.documentType,
        channelCode: k.channelCode,
        status: "ERROR",
        reason: errReasons.join("；"),
      };
    }
    return {
      documentNumber: k.documentNumber,
      documentType: k.documentType,
      channelCode: k.channelCode,
      status: validOverwriteKeySet.has(ks) ? "OVERWRITTEN" : "CREATED",
    };
  });
  const totalErrors = [...validationErrors, ...errors];

  await prisma.importLog.create({
    data: {
      filename: file.name,
      source: "EXCEL",
      orderNo,
      successCount: created + updated,
      errorCount: totalErrors.length,
      message:
        totalErrors.length > 0 ? totalErrors.slice(0, 50).join("\n") : "OK",
      uploader: u.name?.trim() || u.username || null,
    },
  });

  await writeAudit({
    user: u,
    action: "doc.import",
    targetType: "InspectionDoc",
    targetLabel: orderNo,
    summary: `匯入單據（新增 ${created}、覆蓋 ${validOverwriteKeySet.size}、錯誤 ${totalErrors.length}）`,
    meta: {
      filename: file.name,
      orderNo,
      created,
      updated,
      overwritten: validOverwriteKeySet.size,
      errorCount: totalErrors.length,
    },
    ip,
  });

  // 前端通常只需要前幾筆錯誤，避免 response 太大
  return NextResponse.json({
    created,
    updated,
    overwritten: validOverwriteKeySet.size,
    errors: totalErrors.slice(0, 200),
    errorCount: totalErrors.length,
    details: details.slice(0, 500),
  });
}
