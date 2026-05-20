/**
 * 員工管理頁面
 * 檔案：src/app/(shell)/employees/page.tsx
 */

import type { Metadata } from "next";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import EmployeesClient from "./employees-client";

export const metadata: Metadata = { title: "員工管理" };

export default async function EmployeesPage() {
  const s = await auth();
  if (!s?.user?.role || !can(s.user.role, "employees.manage")) {
    return (
      <p className="text-muted-foreground">
        無權限管理員工。僅管理者可使用此功能。
      </p>
    );
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const initialRows = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        員工管理
      </h1>
      <EmployeesClient initialRows={initialRows} />
    </div>
  );
}
