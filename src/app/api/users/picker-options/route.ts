/**
 * 驗收畫面：可指定揀貨員清單
 * 對應 URL：/api/users/picker-options
 */

import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";

/** 可作揀貨人／倉儲相關帳號列表（驗收出貨畫面下拉用） */
export async function GET() {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.ship");
  if (f) return f;

  const users = await prisma.user.findMany({
    where: { role: { in: [Role.WAREHOUSE, Role.ADMIN] }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}
