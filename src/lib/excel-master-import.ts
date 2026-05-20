/**
 * 通路／商品等主檔 Excel：泛用表頭列解析（首列表頭、資料列字串矩陣）。
 */
import ExcelJS from "exceljs";

function normHeader(h: string): string {
  return h.replace(/\s/g, "").toLowerCase();
}

function pickCol(
  headerToIdx: Record<string, number>,
  aliases: string[],
): number | undefined {
  for (const a of aliases) {
    const k = normHeader(a);
    if (headerToIdx[k] !== undefined) return headerToIdx[k];
  }
  return undefined;
}

export function strCell(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(Math.trunc(v) === v ? Math.trunc(v) : v);
  }
  return String(v).trim();
}

/** 第一列為表頭，若第一格為空則整列略過表頭偵測失敗 */
export async function parseWorksheetRows(
  data: ArrayBuffer,
): Promise<{ headers: string[]; rows: string[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(data) as never);
  const sheet = wb.worksheets[0];
  if (!sheet) {
    throw new Error("Excel 無工作表");
  }
  const raw: string[][] = [];
  sheet.eachRow((row, rowNumber) => {
    const vals = row.values;
    if (!Array.isArray(vals)) {
      raw[rowNumber - 1] = [];
      return;
    }
    const cells = vals.slice(1).map((cell) => {
      let v: unknown = cell;
      if (v && typeof v === "object" && "text" in v) {
        v = (v as { text: string }).text;
      }
      return strCell(v);
    });
    raw[rowNumber - 1] = cells;
  });
  const first = raw[0]?.map((x) => strCell(x)) ?? [];
  if (!first.some(Boolean)) {
    throw new Error("第一列表頭為空");
  }
  const dataRows = raw.slice(1).filter((r) => r.some((c) => strCell(c)));
  return { headers: first, rows: dataRows };
}

export function headerIndexMap(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = normHeader(h);
    if (n) m[n] = i;
  });
  return m;
}

export const CHANNEL_COL = {
  channelCode: ["通路代碼", "channelcode", "代碼", "channel"],
  name: ["名稱", "通路名稱", "name"],
  department: ["部門", "部門名稱", "department"],
  phone: ["電話", "phone", "聯絡電話"],
  address: ["地址", "address"],
  lingyueCode: ["凌越代碼", "lingyuecode", "凌越"],
} as const;

export const PRODUCT_COL = {
  productCode: ["貨品編號", "productcode", "貨號", "sku", "品號"],
  name: ["名稱", "商品名稱", "品名", "name"],
  brand: ["品牌", "brand", "廠牌"],
  barcode: ["條碼", "barcode", "國際條碼", "ean"],
  storageLocation: ["儲位", "storagelocation", "庫位"],
} as const;

export type ChannelImportCols = {
  channelCode: number;
  name: number;
  department: number;
  phone: number;
  address: number;
  lingyueCode: number;
};

export type ProductImportCols = {
  productCode: number;
  name: number;
  barcode: number;
  brand?: number;
  storageLocation?: number;
};

export function resolveChannelColumns(
  headers: string[],
): ChannelImportCols | null {
  const m = headerIndexMap(headers);
  const channelCode = pickCol(m, [...CHANNEL_COL.channelCode]);
  const name = pickCol(m, [...CHANNEL_COL.name]);
  const department = pickCol(m, [...CHANNEL_COL.department]);
  const phone = pickCol(m, [...CHANNEL_COL.phone]);
  const address = pickCol(m, [...CHANNEL_COL.address]);
  const lingyueCode = pickCol(m, [...CHANNEL_COL.lingyueCode]);
  if (
    channelCode === undefined ||
    name === undefined ||
    department === undefined ||
    phone === undefined ||
    address === undefined ||
    lingyueCode === undefined
  ) {
    return null;
  }
  return {
    channelCode,
    name,
    department,
    phone,
    address,
    lingyueCode,
  };
}

export function resolveProductColumns(
  headers: string[],
): ProductImportCols | null {
  const m = headerIndexMap(headers);
  const productCode = pickCol(m, [...PRODUCT_COL.productCode]);
  const name = pickCol(m, [...PRODUCT_COL.name]);
  const barcode = pickCol(m, [...PRODUCT_COL.barcode]);
  if (productCode === undefined || name === undefined || barcode === undefined) {
    return null;
  }
  return {
    productCode,
    name,
    barcode,
    brand: pickCol(m, [...PRODUCT_COL.brand]),
    storageLocation: pickCol(m, [...PRODUCT_COL.storageLocation]),
  };
}
