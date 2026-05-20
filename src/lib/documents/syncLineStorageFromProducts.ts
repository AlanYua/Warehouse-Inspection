/**
 * Backfill DocumentLine fields from Product when the line value is blank.
 * (same idea as applyExternalRows).
 */
import { prisma } from "@/lib/prisma";

function normBarcode(s: unknown): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-z]/g, "");
}

type LineStorageRow = {
  id: string;
  productCode: string;
  storageLocation: string | null;
  barcode?: string | null;
  productName?: string | null;
};

export async function syncLineStorageFromProducts(
  lines: LineStorageRow[],
): Promise<boolean> {
  if (lines.length === 0) return false;
  const codes = Array.from(
    new Set(lines.map((l) => (l.productCode ?? "").trim()).filter(Boolean)),
  );
  const barcodes = Array.from(
    new Set(
      lines
        .map((l) => normBarcode(l.barcode))
        .filter(Boolean),
    ),
  );

  // 同時用貨號與條碼抓商品；舊資料可能只有條碼沒貨號，避免驗收表顯示空白
  const products =
    codes.length === 0 && barcodes.length === 0
      ? []
      : await prisma.product.findMany({
          where: {
            OR: [
              ...(codes.length ? [{ productCode: { in: codes } }] : []),
              ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
            ],
          },
          select: {
            productCode: true,
            storageLocation: true,
            barcode: true,
            name: true,
          },
        });
  const byCode = new Map(products.map((p) => [p.productCode, p] as const));
  const byBarcode = new Map(
    products
      .map((p) => [normBarcode(p.barcode), p] as const)
      .filter(([b]) => Boolean(b)),
  );
  const updates: Array<{
    id: string;
    productCode?: string;
    storageLocation?: string;
    barcode?: string | null;
    productName?: string;
  }> = [];
  for (const l of lines) {
    const code = (l.productCode ?? "").trim();
    const b = normBarcode(l.barcode);
    const p = (code ? byCode.get(code) : null) ?? (b ? byBarcode.get(b) : null);
    if (!p) continue;

    const next: (typeof updates)[number] = { id: l.id };

    const lineCodeEmpty = !code;
    const pCode = p.productCode?.trim();
    if (lineCodeEmpty && pCode) next.productCode = pCode;

    const lineLocEmpty = !l.storageLocation?.trim();
    const pLoc = p.storageLocation?.trim();
    if (lineLocEmpty && pLoc) next.storageLocation = pLoc;

    const lineBarcodeEmpty = !l.barcode?.trim();
    const pBarcode = p.barcode?.trim();
    if (lineBarcodeEmpty && pBarcode) next.barcode = pBarcode;

    const lineNameEmpty = !l.productName?.trim();
    const pName = p.name?.trim();
    if (lineNameEmpty && pName) next.productName = pName;

    if (Object.keys(next).length > 1) updates.push(next);
  }
  if (updates.length === 0) return false;
  await prisma.$transaction(
    updates.map((u) =>
      prisma.documentLine.update({
        where: { id: u.id },
        data: {
          ...(u.productCode ? { productCode: u.productCode } : {}),
          ...(u.storageLocation ? { storageLocation: u.storageLocation } : {}),
          ...(u.barcode ? { barcode: u.barcode } : {}),
          ...(u.productName ? { productName: u.productName } : {}),
        },
      }),
    ),
  );
  return true;
}
