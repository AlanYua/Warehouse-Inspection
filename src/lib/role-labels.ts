/**
 * Prisma Role enum 對應畫面顯示用中文標籤。
 */
import type { Role } from "@prisma/client";

const labels: Record<Role, string> = {
  WAREHOUSE: "倉庫",
  WAREHOUSE_SUPERVISOR: "倉庫主管",
  SALES: "業務",
  PROCUREMENT: "採購",
  ADMIN: "管理者",
};

export function roleLabel(r: Role): string {
  return labels[r] ?? r;
}
