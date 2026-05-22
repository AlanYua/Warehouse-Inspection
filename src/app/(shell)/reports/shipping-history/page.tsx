/**
 * 出貨歷史紀錄（僅查詢檢視）
 */
import type { Metadata } from "next";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { Page, PageHeader } from "@/components/ui/page-shell";
import ShippingHistoryClient from "./shipping-history-client";

export const metadata: Metadata = { title: "出貨歷史" };

export default async function ShippingHistoryPage() {
  const s = await auth();
  if (!s?.user?.role || !can(s.user.role, "reports.shipping-history.view")) {
    return (
      <p className="text-muted-foreground">無權限檢視出貨歷史紀錄。</p>
    );
  }

  return (
    <Page>
      <PageHeader title="出貨歷史紀錄" />
      <ShippingHistoryClient />
    </Page>
  );
}
