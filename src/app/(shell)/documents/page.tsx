/**
 * 單據列表頁
 * 檔案：src/app/(shell)/documents/page.tsx
 */

import type { Metadata } from "next";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import DocumentsList from "./documents-list";

export const metadata: Metadata = { title: "單據列表" };

export default async function DocumentsPage() {
  const s = await auth();
  const role = s?.user?.role;
  const canDelete = !!(role && can(role, "documents.delete"));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        單據
      </h1>
      <DocumentsList canDelete={canDelete} role={role ?? undefined} />
    </div>
  );
}
