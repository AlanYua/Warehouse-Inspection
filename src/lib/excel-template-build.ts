/**
 * 產生僅含表頭列的 .xlsx，供下載匯入範本。
 */
import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";

/** 僅第一列表頭，供匯入範本下載 */
export async function buildImportTemplateXlsx(
  headers: readonly string[],
  sheetName = "範本",
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow([...headers]);
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
}
