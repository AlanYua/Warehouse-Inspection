/**
 * 首頁 Dashboard
 * 檔案：src/app/(shell)/page.tsx
 */

import type { Metadata } from "next";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
          儀表板
        </h1>
      </div>
      <div className="rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm">
        <DashboardClient />
      </div>
    </div>
  );
}
