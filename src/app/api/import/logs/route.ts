/**
 * 匯入／同步紀錄列表
 * 對應 URL：/api/import/logs
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-guard";
import { can } from "@/lib/permissions";

export async function GET() {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(u.role, "documents.import") && !can(u.role, "settings.print")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await prisma.importLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(rows);
}
