/**
 * 列印版面設定讀寫
 * 對應 URL：/api/print-settings
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

const PRINT_SETTINGS_ID = 1;

export async function GET() {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;

  const [departments, header] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.companyPrintHeader.findUnique({ where: { id: PRINT_SETTINGS_ID } }),
  ]);

  return NextResponse.json({
    departments,
    header: header
      ? {
          companyName: header.companyName,
          companyPhone: header.companyPhone,
          companyAddress: header.companyAddress,
        }
      : null,
  });
}

const putSchema = z.object({
  companyName: z.string().min(1),
  companyPhone: z.string().optional().nullable(),
  companyAddress: z.string().optional().nullable(),
});

export async function PUT(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "settings.print");
  if (f) return f;
  const body = putSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const row = await prisma.companyPrintHeader.upsert({
    where: { id: PRINT_SETTINGS_ID },
    create: {
      id: PRINT_SETTINGS_ID,
      companyName: body.data.companyName,
      companyPhone: body.data.companyPhone ?? null,
      companyAddress: body.data.companyAddress ?? null,
    },
    update: {
      companyName: body.data.companyName,
      companyPhone: body.data.companyPhone ?? null,
      companyAddress: body.data.companyAddress ?? null,
    },
  });

  await writeAudit({
    user: u,
    action: "setting.print",
    targetType: "CompanyPrintHeader",
    targetId: String(PRINT_SETTINGS_ID),
    targetLabel: row.companyName,
    summary: `更新列印抬頭 ${row.companyName}`,
    meta: {
      companyName: row.companyName,
      companyPhone: row.companyPhone,
      companyAddress: row.companyAddress,
    },
  });
  return NextResponse.json(row);
}
