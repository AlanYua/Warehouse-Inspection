/**
 * 單據 Excel：表頭對應、列解析為 ExternalDocumentRow[]，規則與 applyExternalRows 一致。
 */
import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import type { ExternalDocumentRow } from "@/lib/sync/types";

export type ParseDocumentsExcelOptions = {
  /** Excel 製單者空白時使用（通常為登入者姓名） */
  defaultCreatorName?: string | null;
  /** 設定主檔名稱；非空時「單據類型」須完全相符 */
  allowedDocumentTypes?: readonly string[];
  /** 單據類型 -> 驗出/驗入（若未填「驗出/驗入」欄位則用此判別） */
  flowByDocumentType?: Record<string, "OUT" | "IN">;
  /** 部門主檔名稱；非空時「部門」須完全相符 */
  allowedDepartments?: readonly string[];
};

const COL = {
  flow: "驗出/驗入",
  docNo: "單據號碼",
  docType: "單據類型",
  docDate: "單據日期",
  lingyue: "凌越代碼",
  channel: "通路代碼",
  name: "名稱",
  phone: "電話",
  address: "地址",
  dept: "部門",
  creator: "製單者",
  sku: "貨品編號",
  barcode: "國際條碼",
  productName: "商品名稱",
  qty: "單據數量",
  storage: "儲位",
  remark: "備註",
} as const;

/** 匯入必填表頭（不含選填「單據日期」與選填「備註」；「名稱」亦不在範本中） */
export const DOCUMENT_IMPORT_REQUIRED_HEADERS = [
  COL.docType,
  COL.docNo,
  COL.channel,
  COL.sku,
  COL.barcode,
  COL.qty,
  COL.dept,
  COL.creator,
] as const;

/** 範本第一列（與實際匯入欄位一致；含選填「單據日期」「備註」） */
export const DOCUMENT_IMPORT_HEADERS = [
  COL.docType,
  COL.docDate,
  COL.docNo,
  COL.channel,
  COL.sku,
  COL.barcode,
  COL.qty,
  COL.remark,
  COL.dept,
  COL.creator,
] as const;

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function inferFlowFallbackFromDocTypeText(docType: string): "OUT" | "IN" {
  const t = String(docType ?? "").replace(/\s/g, "");
  if (!t) return "OUT";
  if (/(驗入|驗收|入庫|收貨|進貨)/.test(t)) return "IN";
  if (/(驗出|出庫|出貨)/.test(t)) return "OUT";
  return "OUT";
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function excelSerialToLocalDate(serial: number): Date {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
  return new Date(ms);
}

/** 單據日期欄為選填；表無此欄時回傳 null */
function parseOptionalDocDate(
  row: ExcelJS.Row,
  colIndex: Record<string, number>,
): string | null {
  const col = colIndex[COL.docDate];
  if (col === undefined) return null;
  const cell = row.getCell(col);
  const v = cell.value as unknown;
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return formatLocalYmd(v);
  }
  if (typeof v === "number") {
    const d = excelSerialToLocalDate(v);
    if (Number.isNaN(d.getTime())) return null;
    return formatLocalYmd(d);
  }
  const s = norm(v);
  if (!s) return null;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return formatLocalYmd(parsed);
  const t = norm(cell.text || "");
  if (t) {
    const p2 = new Date(t);
    if (!Number.isNaN(p2.getTime())) return formatLocalYmd(p2);
  }
  return null;
}

export async function parseDocumentsExcel(
  data: Uint8Array | ArrayBuffer,
  options?: ParseDocumentsExcelOptions,
): Promise<ExternalDocumentRow[]> {
  const wb = new ExcelJS.Workbook();
  const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  await wb.xlsx.load(Buffer.from(u8) as never);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("工作表為空");

  const headerRow = sheet.getRow(1);
  const colIndex: Record<string, number> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const h = norm(cell.text);
    if (h) colIndex[h] = colNumber;
  });

  const need = [...DOCUMENT_IMPORT_REQUIRED_HEADERS];
  for (const k of need) {
    if (colIndex[k] === undefined) {
      throw new Error(`缺少欄位「${k}」，請依範本第一列標題`);
    }
  }

  type RawLine = {
    docNo: string;
    docType: string;
    flow: "OUT" | "IN";
    lingyue: string;
    channel: string;
    name: string;
    phone: string;
    address: string;
    dept: string;
    creator: string;
    docDate: string | null;
    sku: string;
    barcode: string;
    productName: string;
    qty: number;
    storage: string;
    remark: string;
  };

  const lines: RawLine[] = [];
  const cellText = (row: ExcelJS.Row, col: number) =>
    norm(row.getCell(col).text || row.getCell(col).value);

  const defaultCreator =
    options?.defaultCreatorName?.trim() || "";
  const allowedTypes = options?.allowedDocumentTypes?.length
    ? new Set(options.allowedDocumentTypes)
    : null;
  const allowedDepts = options?.allowedDepartments?.length
    ? new Set(options.allowedDepartments)
    : null;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const getRequired = (key: keyof typeof COL) => {
      const col = colIndex[COL[key]];
      return cellText(row, col);
    };
    const getOptional = (key: keyof typeof COL) => {
      const col = colIndex[COL[key]];
      if (col === undefined) return "";
      return cellText(row, col);
    };

    const docNo = getRequired("docNo");
    if (!docNo) continue;

    const docType = getRequired("docType");
    if (!docType) {
      throw new Error(`第 ${r} 列缺少必填「單據類型」`);
    }
    if (allowedTypes && !allowedTypes.has(docType)) {
      throw new Error(
        `第 ${r} 列單據類型「${docType}」不在設定主檔，請至「設定」維護或修正 Excel`,
      );
    }
    const channel = getRequired("channel");
    if (!channel) {
      throw new Error(`第 ${r} 列缺少必填「通路代碼」`);
    }

    // 驗出/驗入：優先吃 Excel 欄位；否則用主檔（單據類型 -> flow）；再不行才用文字 fallback
    const flowCol = colIndex[COL.flow];
    const rawFlow =
      flowCol === undefined ? "" : cellText(row, flowCol);
    const flowNorm = rawFlow.replace(/\s/g, "");
    const flow: "OUT" | "IN" =
      flowNorm === "驗入" || flowNorm === "驗收"
        ? "IN"
        : flowNorm === "驗出"
          ? "OUT"
          : flowCol === undefined || !flowNorm
            ? (options?.flowByDocumentType?.[docType] ??
                inferFlowFallbackFromDocTypeText(docType))
            : (() => {
                throw new Error(
                  `第 ${r} 列「驗出/驗入」需填「驗出」或「驗入」（也接受「驗收」），目前為「${rawFlow}」`,
                );
              })();

    const sku = getRequired("sku");
    const barcode = getRequired("barcode");
    if (!sku && !barcode) {
      throw new Error(
        `第 ${r} 列缺少必填：須填「貨品編號」或「國際條碼」至少一項`,
      );
    }
    const remark = getOptional("remark");

    const qtyStr = getRequired("qty");
    const qty = Number(String(qtyStr).replace(/,/g, ""));
    if (Number.isNaN(qty)) {
      throw new Error(`第 ${r} 列單據數量無效或缺少必填「單據數量」`);
    }

    const creatorCell = getRequired("creator");
    const creator = creatorCell || defaultCreator;
    const docDate = parseOptionalDocDate(row, colIndex);
    const dept = getRequired("dept");
    if (!dept) {
      throw new Error(`第 ${r} 列缺少必填「部門」`);
    }
    if (allowedDepts && !allowedDepts.has(dept)) {
      throw new Error(
        `第 ${r} 列部門「${dept}」不在設定主檔，請至「設定」維護或修正 Excel`,
      );
    }

    lines.push({
      docNo,
      docType,
      flow,
      lingyue: getOptional("lingyue"),
      channel,
      name: getOptional("name"),
      phone: getOptional("phone"),
      address: getOptional("address"),
      dept,
      creator,
      docDate,
      sku,
      barcode,
      productName: getOptional("productName"),
      qty,
      storage: getOptional("storage"),
      remark,
    });
  }

  /** 同一筆單據 = 單據號碼 + 通路代碼 + 單據類型 */
  const groupKey = (docNo: string, channel: string, docType: string) =>
    `${docNo}\u0001${channel}\u0001${docType}`;

  const byDoc = new Map<string, RawLine[]>();
  for (const L of lines) {
    const k = groupKey(L.docNo, L.channel, L.docType);
    const arr = byDoc.get(k) ?? [];
    arr.push(L);
    byDoc.set(k, arr);
  }

  const out: ExternalDocumentRow[] = [];
  for (const [, docLines] of byDoc) {
    const first = docLines[0];
    const docNo = first.docNo;

    out.push({
      documentNumber: docNo,
      documentType: first.docType,
      flow: first.flow,
      documentDate: first.docDate,
      lingyueCode: first.lingyue || null,
      channelCode: first.channel,
      counterpartyName: first.name || null,
      phone: first.phone || null,
      address: first.address || null,
      departmentName: first.dept || null,
      creatorName: first.creator || null,
      lines: docLines.map((l) => ({
        productCode: l.sku || null,
        barcode: l.barcode || null,
        productName: l.productName || null,
        docQuantity: l.qty,
        storageLocation: l.storage || null,
        remark: l.remark,
      })),
    });
  }

  return out;
}
