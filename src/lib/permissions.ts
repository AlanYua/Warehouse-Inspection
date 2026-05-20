/**
 * 角色 × 權限矩陣。Permission 字串供 UI 與 API 共用，改規則只動此檔。
 */
import { Role } from "@prisma/client";

export type Permission =
  | "documents.view"
  | "documents.inspect"
  | "documents.ship"
  | "documents.stock"
  | "documents.unlock"
  | "documents.delete"
  | "documents.import"
  | "comments.view"
  | "comments.create"
  | "comments.edit"
  | "comments.delete"
  | "products.view"
  | "products.edit"
  | "products.delete"
  | "products.storageOnly"
  | "channels.view"
  | "channels.edit"
  | "channels.delete"
  | "settings.print"
  | "returns.view"
  | "returns.manage"
  | "dashboard.view"
  | "reports.shipping-history.view"
  | "employees.manage"
  | "audit.view";

const matrix: Record<Role, Permission[]> = {
  [Role.WAREHOUSE]: [
    "documents.view",
    "documents.inspect",
    "documents.ship",
    "comments.view",
    "comments.create",
    "products.view",
    "products.storageOnly",
    "channels.view",
    "returns.view",
    "returns.manage",
    "dashboard.view",
    "reports.shipping-history.view",
  ],
  [Role.WAREHOUSE_SUPERVISOR]: [
    "documents.view",
    "documents.inspect",
    "documents.ship",
    "documents.stock",
    "documents.unlock",
    "documents.delete",
    "comments.view",
    "comments.create",
    "comments.edit",
    "comments.delete",
    "products.view",
    "products.storageOnly",
    "channels.view",
    "returns.view",
    "returns.manage",
    "dashboard.view",
    "reports.shipping-history.view",
  ],
  [Role.SALES]: [
    "documents.view",
    "documents.inspect",
    "documents.import",
    "comments.view",
    "comments.create",
    "products.view",
    "channels.view",
    "channels.edit",
    "channels.delete",
    "returns.view",
    "dashboard.view",
    "reports.shipping-history.view",
  ],
  [Role.PROCUREMENT]: [
    "documents.view",
    "documents.import",
    "comments.view",
    "comments.create",
    "comments.edit",
    "products.view",
    "products.edit",
    "products.delete",
    "channels.view",
    "channels.edit",
    "dashboard.view",
    "reports.shipping-history.view",
  ],
  [Role.ADMIN]: [
    "documents.view",
    "documents.inspect",
    "documents.ship",
    "documents.stock",
    "documents.unlock",
    "documents.delete",
    "documents.import",
    "comments.view",
    "comments.create",
    "comments.edit",
    "comments.delete",
    "products.view",
    "products.edit",
    "products.delete",
    "products.storageOnly",
    "channels.view",
    "channels.edit",
    "channels.delete",
    "settings.print",
    "returns.view",
    "returns.manage",
    "dashboard.view",
    "reports.shipping-history.view",
    "employees.manage",
    "audit.view",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return matrix[role]?.includes(permission) ?? false;
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    const err = new Error("Forbidden");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}
