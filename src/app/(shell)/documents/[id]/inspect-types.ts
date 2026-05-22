import { AcceptMethod, DocumentStatus } from "@prisma/client";

export type Line = {
  id: string;
  productCode: string;
  barcode: string | null;
  productName: string;
  docQuantity: number;
  inspectQuantity: number;
  pickerPicked?: boolean;
  remark: string | null;
  storageLocation: string | null;
};

export type Doc = {
  id: string;
  documentNumber: string;
  documentType: string;
  flow: "OUT" | "IN";
  documentDate: string | null;
  createdAt: string;
  status: DocumentStatus;
  acceptMethod: AcceptMethod;
  counterpartyName: string | null;
  channelCode: string | null;
  lingyueCode: string | null;
  phone: string | null;
  address: string | null;
  creatorName: string | null;
  department: { name: string };
  inspector: { id: string; name: string } | null;
  picker: { id: string; name: string } | null;
  logisticsNo: string | null;
  packageCount: number | null;
  packageCountA: number | null;
  packageCountC: number | null;
  packageSize: string | null;
  shippedAt: string | null;
  stockedAt: string | null;
  stockedBy: { id: string; name: string } | null;
  lockedBy: { id: string; name: string } | null;
  lines: Line[];
  updatedAt: string;
};

export const statusZh: Record<DocumentStatus, string> = {
  PENDING: "未完成",
  INSPECTING: "驗收中",
  COMPLETED: "已完成",
  SHIPPED: "已出貨",
};

export function statusLabel(doc: Doc): string {
  if (doc.flow === "IN" && doc.status === DocumentStatus.COMPLETED && doc.stockedAt) {
    return "已入庫";
  }
  return statusZh[doc.status] ?? "—";
}

export const flowZh: Record<"OUT" | "IN", string> = {
  OUT: "驗出",
  IN: "驗入",
};

const storageCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function compareStorageLocation(a: string | null, b: string | null) {
  const aa = (a ?? "").trim();
  const bb = (b ?? "").trim();
  if (!aa && !bb) return 0;
  if (!aa) return 1;
  if (!bb) return -1;

  const aU = aa.toUpperCase();
  const bU = bb.toUpperCase();
  const a0 = aU[0] ?? "";
  const b0 = bU[0] ?? "";
  const head = storageCollator.compare(a0, b0);
  if (head !== 0) return head;

  return storageCollator.compare(aU, bU);
}

/** 驗收中固定匯入序；其餘依儲位＋貨號＋id 穩定排序 */
export function sortDocumentLines(
  lines: Line[],
  mode: "inspect" | "storage",
): Line[] {
  const copy = [...lines];
  if (mode === "inspect") {
    return copy.sort((a, b) => a.id.localeCompare(b.id));
  }
  return copy.sort((a, b) => {
    const loc = compareStorageLocation(a.storageLocation, b.storageLocation);
    if (loc !== 0) return loc;
    const code = a.productCode.localeCompare(b.productCode, "en");
    if (code !== 0) return code;
    return a.id.localeCompare(b.id);
  });
}
