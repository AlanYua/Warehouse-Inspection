/**
 * 驗收單據匯出：多筆單據＋明細列寫成 Excel 工作表。
 */
import ExcelJS from "exceljs";
import type { DocumentLine, DocumentStatus, InspectionDoc } from "@prisma/client";

type DocWithDeptAndLines = InspectionDoc & {
  department: { name: string };
  lines: DocumentLine[];
};

const statusZh: Record<DocumentStatus, string> = {
  PENDING: "未完成",
  INSPECTING: "驗收中",
  COMPLETED: "已完成",
  SHIPPED: "已出貨",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleDateString("zh-TW");
}

export async function buildDocumentsDetailWorkbook(
  docs: DocWithDeptAndLines[],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("單據明細", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "單據號碼", key: "documentNumber", width: 16 },
    { header: "單據類型", key: "documentType", width: 12 },
    { header: "單據日期", key: "documentDate", width: 12 },
    { header: "部門", key: "dept", width: 12 },
    { header: "狀態", key: "statusZh", width: 10 },
    { header: "名稱", key: "counterpartyName", width: 14 },
    { header: "通路代碼", key: "channelCode", width: 12 },
    { header: "凌越代碼", key: "lingyueCode", width: 12 },
    { header: "貨品編號", key: "productCode", width: 14 },
    { header: "國際條碼", key: "barcode", width: 16 },
    { header: "商品名稱", key: "productName", width: 24 },
    { header: "單據數量", key: "docQuantity", width: 11 },
    { header: "驗收數量", key: "inspectQuantity", width: 11 },
    { header: "儲位", key: "storageLocation", width: 10 },
    { header: "備註", key: "remark", width: 16 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE7E7E7" },
  };

  for (const doc of docs) {
    const base = {
      documentNumber: doc.documentNumber,
      documentType: doc.documentType,
      documentDate: fmtDate(doc.documentDate ?? undefined),
      dept: doc.department.name,
      statusZh: statusZh[doc.status],
      counterpartyName: doc.counterpartyName ?? "",
      channelCode: doc.channelCode ?? "",
      lingyueCode: doc.lingyueCode ?? "",
    };

    if (doc.lines.length === 0) {
      sheet.addRow({
        ...base,
        productCode: "",
        barcode: "",
        productName: "",
        docQuantity: "",
        inspectQuantity: "",
        storageLocation: "",
        remark: "",
      });
      continue;
    }

    for (const line of doc.lines) {
      sheet.addRow({
        ...base,
        productCode: line.productCode,
        barcode: line.barcode ?? "",
        productName: line.productName,
        docQuantity: line.docQuantity,
        inspectQuantity: line.inspectQuantity,
        storageLocation: line.storageLocation ?? "",
        remark: line.remark ?? "",
      });
    }
  }

  const wb = await workbook.xlsx.writeBuffer();
  if (wb instanceof ArrayBuffer) return new Uint8Array(wb);
  return Uint8Array.from(wb as Iterable<number>);
}

export function exportFilenameBase(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `documents-${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}
