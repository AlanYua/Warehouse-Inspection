/**
 * 驗收單據：列印頁匯總資料
 * 對應 URL：/api/documents/print-data
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";

const PRINT_SETTINGS_ID = 1;

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.view");
  if (f) return f;

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "需要 ids" }, { status: 400 });
  }

  const [docs, headerRow] = await Promise.all([
    prisma.inspectionDoc.findMany({
      where: { id: { in: ids } },
      include: {
        department: true,
        lines: true,
        picker: { select: { username: true } },
        inspector: { select: { username: true } },
      },
    }),
    prisma.companyPrintHeader.findUnique({ where: { id: PRINT_SETTINGS_ID } }),
  ]);

  const codes = [
    ...new Set(
      docs.map((d) => d.channelCode?.trim()).filter((c): c is string => !!c),
    ),
  ];
  const channels =
    codes.length > 0
      ? await prisma.channel.findMany({
          where: { channelCode: { in: codes } },
        })
      : [];
  const channelByCode = new Map(channels.map((c) => [c.channelCode, c]));

  const docsOut = docs.map((d) => {
    const code = d.channelCode?.trim() ?? "";
    const ch = code ? channelByCode.get(code) : undefined;
    const channelStore = code
      ? {
          channelCode: code,
          name: ch?.name ?? null,
          phone: ch?.phone ?? null,
          address: ch?.address ?? null,
        }
      : null;
    return { ...d, channelStore };
  });

  const printHeader = headerRow
    ? {
        companyName: headerRow.companyName,
        companyPhone: headerRow.companyPhone,
        companyAddress: headerRow.companyAddress,
      }
    : null;

  return NextResponse.json({ printHeader, docs: docsOut });
}
