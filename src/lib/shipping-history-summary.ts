/** 單據類型是否為退貨／退回類（銷退、退貨單等） */
export function isReturnDocumentType(documentType: string): boolean {
  const t = String(documentType ?? "").replace(/\s/g, "");
  return /(退貨|退回|銷退|退倉)/.test(t);
}

export type ShippingHistorySummary = {
  purchaseQty: number;
  salesQty: number;
  customerReturnQty: number;
  vendorReturnQty: number;
  netStock: number;
};

/** 依驗收量彙總；淨庫存 = 進貨 − 銷貨 + 客戶退貨 − 廠商退貨 */
export function summarizeShippingHistory(
  lines: {
    inspectQuantity: number;
    document: { flow: "OUT" | "IN"; documentType: string };
  }[],
): ShippingHistorySummary {
  let purchaseQty = 0;
  let salesQty = 0;
  let customerReturnQty = 0;
  let vendorReturnQty = 0;

  for (const l of lines) {
    const q = l.inspectQuantity;
    if (!q) continue;
    const dt = l.document.documentType;
    const flow = l.document.flow;

    if (isReturnDocumentType(dt)) {
      if (flow === "IN") customerReturnQty += q;
      else vendorReturnQty += q;
    } else if (flow === "IN") {
      purchaseQty += q;
    } else {
      salesQty += q;
    }
  }

  const netStock =
    purchaseQty - salesQty + customerReturnQty - vendorReturnQty;

  return {
    purchaseQty,
    salesQty,
    customerReturnQty,
    vendorReturnQty,
    netStock,
  };
}
