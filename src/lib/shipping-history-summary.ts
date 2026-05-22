/** 單據類型是否為退貨／退回類（銷退、退貨單等） */
export function isReturnDocumentType(documentType: string): boolean {
  const t = String(documentType ?? "").replace(/\s/g, "");
  return /(退貨|退回|銷退|退倉)/.test(t);
}

export type ShippingHistorySummary = {
  purchaseQty: number;
  shippedQty: number;
  customerReturnQty: number;
  supplierReturnQty: number;
  netStock: number;
};

/** 依驗收量彙總；淨庫存 = 進貨 − 出貨 + 客戶退貨 − 退供應商 */
export function summarizeShippingHistory(
  lines: {
    inspectQuantity: number;
    document: { flow: "OUT" | "IN"; documentType: string };
  }[],
): ShippingHistorySummary {
  let purchaseQty = 0;
  let shippedQty = 0;
  let customerReturnQty = 0;
  let supplierReturnQty = 0;

  for (const l of lines) {
    const q = l.inspectQuantity;
    if (!q) continue;
    const dt = l.document.documentType;
    const flow = l.document.flow;

    if (isReturnDocumentType(dt)) {
      if (flow === "IN") customerReturnQty += q;
      else supplierReturnQty += q;
    } else if (flow === "IN") {
      purchaseQty += q;
    } else {
      shippedQty += q;
    }
  }

  const netStock =
    purchaseQty - shippedQty + customerReturnQty - supplierReturnQty;

  return {
    purchaseQty,
    shippedQty,
    customerReturnQty,
    supplierReturnQty,
    netStock,
  };
}
