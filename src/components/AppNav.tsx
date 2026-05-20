/**
 * 依權限顯示導覽（Server：組連結 → Client：響應式／摺疊選單）。
 */
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { roleLabel } from "@/lib/role-labels";
import { AppNavClient } from "@/components/AppNavClient";

export async function AppNav() {
  const session = await auth();
  if (!session?.user?.role) return null;
  const r = session.user.role as Role;

  const items: { href: string; label: string }[] = [];
  if (can(r, "dashboard.view")) items.push({ href: "/", label: "Dashboard" });
  if (can(r, "documents.view")) items.push({ href: "/documents", label: "單據" });
  if (can(r, "dashboard.view") || can(r, "documents.view")) {
    items.push({ href: "/reports/daily", label: "日報表" });
  }
  if (can(r, "reports.shipping-history.view")) {
    items.push({ href: "/reports/shipping-history", label: "出貨歷史" });
  }
  if (can(r, "documents.import")) items.push({ href: "/documents/import", label: "匯入" });
  if (can(r, "documents.import") || can(r, "settings.print")) {
    items.push({ href: "/settings/sync", label: "匯入紀錄" });
  }
  if (can(r, "channels.view")) items.push({ href: "/master/channels", label: "通路" });
  if (can(r, "products.view")) items.push({ href: "/master/products", label: "商品" });
  if (can(r, "returns.view")) {
    items.push({ href: "/returns", label: "退貨驗收" });
  }
  if (can(r, "settings.print")) items.push({ href: "/settings", label: "設定" });
  if (can(r, "employees.manage")) items.push({ href: "/employees", label: "員工管理" });
  if (can(r, "audit.view")) items.push({ href: "/audit-logs", label: "操作紀錄" });

  const userBadge = `${session.user.name}（${roleLabel(r)}）`;

  return <AppNavClient items={items} userBadge={userBadge} />;
}
