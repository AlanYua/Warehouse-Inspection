/**
 * 單筆驗收／檢視頁（server）
 * 檔案：src/app/(shell)/documents/[id]/page.tsx
 */

import type { Metadata } from "next";
import DocumentInspect from "./inspect-client";

export const metadata: Metadata = { title: "單據驗收" };

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        單據驗收
      </h1>
      <DocumentInspect id={id} />
    </div>
  );
}
