/**
 * 操作紀錄頁面（僅 ADMIN 可看）
 * 檔案：src/app/(shell)/audit-logs/page.tsx
 */

import type { Metadata } from "next";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Page, PageHeader } from "@/components/ui/page-shell";
import AuditLogsClient from "./audit-logs-client";

export const metadata: Metadata = { title: "操作紀錄" };

export default async function AuditLogsPage() {
  const s = await auth();
  if (!s?.user?.role || !can(s.user.role, "audit.view")) {
    return (
      <p className="text-muted-foreground">
        無權限檢視操作紀錄。僅管理者可使用此功能。
      </p>
    );
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, username: true, name: true },
  });

  return (
    <Page>
      <PageHeader title="操作紀錄" />
      <AuditLogsClient users={users} />
    </Page>
  );
}
