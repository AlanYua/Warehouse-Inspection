/** 匯入欄位正規化（NFKC、全形數字、多餘空白） */
export function normImportText(s: unknown): string {
  return String(s ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "");
}

/** 通路代碼：Excel 數字格常出現 40.0 */
export function normChannelCode(s: unknown): string {
  const t = normImportText(s);
  if (!t) return "";
  if (/^\d+\.\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n) && Number.isInteger(n)) return String(n);
  }
  return t;
}
