/**
 * 首頁 Dashboard
 * 檔案：src/app/(shell)/page.tsx
 */

import type { Metadata } from "next";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Page, PageHeader, Panel, PanelBody } from "@/components/ui/page-shell";
import DashboardClient from "./dashboard-client";

export const metadata: Metadata = { title: "儀表板" };

export default async function DashboardPage() {
  const s = await auth();
  if (!s?.user?.role) redirect("/login");
  if (!can(s.user.role, "dashboard.view")) {
    return (
      <p className="text-muted-foreground">
        無權限檢視儀表板。請從選單進入可用功能。
      </p>
    );
  }

  return (
    <Page>
      <PageHeader title="儀表板" />
      <Panel>
        <PanelBody>
          <DashboardClient />
        </PanelBody>
      </Panel>
    </Page>
  );
}
