/** 貨號／條碼比對（與驗收掃碼邏輯一致） */
export function normCode(s: string): string {
  return String(s ?? "").trim().replace(/\s+/g, "");
}

export function normBarcode(s: string): string {
  return normCode(s).replace(/[^0-9A-Za-z]/g, "");
}

export function codesMatchProduct(
  input: string,
  productCode: string,
  barcode: string | null | undefined,
): boolean {
  const c = normCode(input);
  const b = normBarcode(input);
  if (!c && !b) return false;
  if (c && normCode(productCode) === c) return true;
  if (b && barcode && normBarcode(barcode) === b) return true;
  return false;
}
