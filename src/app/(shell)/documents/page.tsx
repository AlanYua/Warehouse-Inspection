/**
 * 單據列表頁
 * 檔案：src/app/(shell)/documents/page.tsx
 */

import type { Metadata } from "next";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { Page, PageHeader } from "@/components/ui/page-shell";
import DocumentsList from "./documents-list";

export const metadata: Metadata = { title: "單據列表" };

export default async function DocumentsPage() {
  const s = await auth();
  const role = s?.user?.role;
  const canDelete = !!(role && can(role, "documents.delete"));

  return (
    <Page>
      <PageHeader title="單據" />
      <DocumentsList canDelete={canDelete} role={role ?? undefined} />
    </Page>
  );
}
