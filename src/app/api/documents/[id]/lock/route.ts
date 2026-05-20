/**
 * 驗收單據：取得／續期驗收鎖定
 * 對應 URL：/api/documents/[id]/lock
 */

import { DocumentFlow, DocumentStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import {
  acquireOrTouchLock,
  type InspectAs,
} from "@/lib/documents/lock";
import { syncLineStorageFromProducts } from "@/lib/documents/syncLineStorageFromProducts";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const bodySchema = z
  .object({
    inspectAs: z.enum(["PICKER", "INSPECTOR"]),
  })
  .optional();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.inspect");
  if (f) return f;
  const { id } = await ctx.params;

  const raw = await req.json().catch(() => undefined);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const meta = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: { status: true, lockedByUserId: true, flow: true },
  });

  let inspectAs: InspectAs | undefined = parsed.data?.inspectAs;
  if (!inspectAs) {
    if (
      meta?.status === DocumentStatus.PENDING &&
      meta.flow === DocumentFlow.IN
    ) {
      inspectAs = "INSPECTOR";
    } else if (meta?.status === DocumentStatus.PENDING) {
      return NextResponse.json(
        { error: "請選擇揀貨或驗收身份（inspectAs）" },
        { status: 400 },
      );
    } else if (
      meta?.status === DocumentStatus.INSPECTING &&
      meta.lockedByUserId == null
    ) {
      if (meta.flow === DocumentFlow.IN) {
        inspectAs = "INSPECTOR";
      } else {
        return NextResponse.json(
          { error: "請選擇揀貨或驗收身份（inspectAs）" },
          { status: 400 },
        );
      }
    }
  }

  if (inspectAs === "INSPECTOR" && u.role === Role.SALES) {
    return NextResponse.json(
      {
        error:
          meta?.flow === DocumentFlow.IN
            ? "業務無法執行驗入檢驗"
            : "業務僅可擔任揀貨者，不能擔任驗收者",
      },
      { status: 403 },
    );
  }

  const beforeLock = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: { lockedByUserId: true },
  });
  const r = await acquireOrTouchLock(id, u.id, inspectAs);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.message, lockedByName: "lockedByName" in r ? r.lockedByName : undefined },
      { status: r.status },
    );
  }
  const lineRows = await prisma.documentLine.findMany({
    where: { documentId: id },
    select: { id: true, productCode: true, storageLocation: true },
  });
  await syncLineStorageFromProducts(lineRows);
  const doc = await prisma.inspectionDoc.findUnique({
    where: { id },
    include: {
      department: true,
      lines: true,
      lockedBy: { select: { id: true, name: true, username: true } },
      inspector: { select: { id: true, name: true, username: true } },
      picker: { select: { id: true, name: true, username: true } },
    },
  });
  // 只在「從無鎖→有鎖」或「身份首次設定」時記錄，避免續期 touch 也產生大量噪音紀錄
  const isNewLock = !beforeLock?.lockedByUserId;
  if (isNewLock) {
    await writeAudit({
      user: u,
      action: "doc.lock",
      targetType: "InspectionDoc",
      targetId: id,
      targetLabel: doc?.documentNumber ?? undefined,
      summary: `取得鎖定（${inspectAs === "PICKER" ? "揀貨者" : inspectAs === "INSPECTOR" ? "驗收者" : "續鎖"}）`,
      meta: { inspectAs: inspectAs ?? null },
    });
  }
  return NextResponse.json(doc);
}
