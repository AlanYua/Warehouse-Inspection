/**
 * 日報表（已出貨）：依部門彙整，輸出 Excel。
 * - Sheet1: 單據彙總（類型 / 單據號碼 / 檢驗總數 / 物流號碼 / 件數）
 * - Sheet2: 品項彙總（品牌 / 貨號 / 條碼 / 檢驗總數）
 */
import ExcelJS from "exceljs";

type DailyDocRow = {
  departmentId: string;
  departmentName: string;
  documentType: string;
  documentNumber: string;
  counterpartyName: string | null;
  logisticsNo: string | null;
  packageCount: number | null;
  inspectTotal: number;
};

type DailyItemRow = {
  departmentId: string;
  departmentName: string;
  brand: string;
  productCode: string;
  barcode: string;
  inspectTotal: number;
};

function safeText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export async function buildDailyShippedWorkbook(args: {
  dateYmd: string;
  docs: DailyDocRow[];
  items: DailyItemRow[];
}): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Shipping Inspection";

  const sheetDocs = workbook.addWorksheet("已出貨-單據", {
    views: [{ state: "frozen", ySplit: 2 }],
  });
  sheetDocs.columns = [
    { header: "部門", key: "departmentName", width: 14 },
    { header: "類型", key: "documentType", width: 12 },
    { header: "單據號碼", key: "documentNumber", width: 18 },
    { header: "名稱", key: "counterpartyName", width: 16 },
    { header: "檢驗總數", key: "inspectTotal", width: 12 },
    { header: "物流號碼", key: "logisticsNo", width: 22 },
    { header: "件數", key: "packageCount", width: 10 },
  ];

  sheetDocs.addRow([`日報表（已出貨）`, `日期：${args.dateYmd}`]);
  sheetDocs.mergeCells(1, 1, 1, 7);
  sheetDocs.getRow(1).font = { bold: true, size: 14 };
  sheetDocs.getRow(2).font = { bold: true };

  for (const r of args.docs) {
    sheetDocs.addRow({
      departmentName: r.departmentName,
      documentType: r.documentType,
      documentNumber: r.documentNumber,
      counterpartyName: r.counterpartyName ?? "",
      inspectTotal: r.inspectTotal,
      logisticsNo: r.logisticsNo ?? "",
      packageCount: r.packageCount ?? "",
    });
  }
  sheetDocs.getColumn("inspectTotal").numFmt = "#,##0";

  const sheetItems = workbook.addWorksheet("已出貨-品項", {
    views: [{ state: "frozen", ySplit: 2 }],
  });
  sheetItems.columns = [
    { header: "部門", key: "departmentName", width: 14 },
    { header: "品牌", key: "brand", width: 16 },
    { header: "貨號", key: "productCode", width: 18 },
    { header: "條碼", key: "barcode", width: 20 },
    { header: "檢驗總數", key: "inspectTotal", width: 12 },
  ];

  sheetItems.addRow([`日報表（已出貨）`, `日期：${args.dateYmd}`]);
  sheetItems.mergeCells(1, 1, 1, 5);
  sheetItems.getRow(1).font = { bold: true, size: 14 };
  sheetItems.getRow(2).font = { bold: true };

  for (const r of args.items) {
    sheetItems.addRow({
      departmentName: r.departmentName,
      brand: safeText(r.brand),
      productCode: r.productCode,
      barcode: safeText(r.barcode),
      inspectTotal: r.inspectTotal,
    });
  }
  sheetItems.getColumn("inspectTotal").numFmt = "#,##0";

  const wb = await workbook.xlsx.writeBuffer();
  if (wb instanceof ArrayBuffer) return new Uint8Array(wb);
  return Uint8Array.from(wb as Iterable<number>);
}

