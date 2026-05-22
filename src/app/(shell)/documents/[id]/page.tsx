/**
 * 單筆驗收／檢視頁（server）
 * 檔案：src/app/(shell)/documents/[id]/page.tsx
 */

import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui/page-shell";
import DocumentInspect from "./inspect-client";

export const metadata: Metadata = { title: "單據驗收" };

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Page>
      <PageHeader title="單據驗收" />
      <DocumentInspect id={id} />
    </Page>
  );
}
