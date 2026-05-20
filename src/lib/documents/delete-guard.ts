import { DocumentStatus, Role } from "@prisma/client";

export type DocDeleteSnapshot = {
  status: DocumentStatus;
  stockedAt: Date | string | null;
};

/** 已出貨或已標記入庫（stockedAt）視為不可刪除（倉庫主管）。 */
export function isDocumentDeleteFinalized(doc: DocDeleteSnapshot): boolean {
  return (
    doc.status === DocumentStatus.SHIPPED ||
    doc.stockedAt != null
  );
}

export function warehouseSupervisorDeleteBlocked(
  doc: DocDeleteSnapshot,
): boolean {
  return isDocumentDeleteFinalized(doc);
}

export function canDeleteDocument(
  role: Role,
  doc: DocDeleteSnapshot,
): { ok: true } | { ok: false; message: string } {
  if (
    role === Role.WAREHOUSE_SUPERVISOR &&
    warehouseSupervisorDeleteBlocked(doc)
  ) {
    return {
      ok: false,
      message:
        doc.status === DocumentStatus.SHIPPED
          ? "已出貨單據不可刪除"
          : "已入庫單據不可刪除",
    };
  }
  return { ok: true };
}
