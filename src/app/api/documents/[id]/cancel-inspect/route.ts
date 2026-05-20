/**
 * 取消驗收身份（揀貨者/驗收者自行退出）
 * 對應 URL：/api/documents/[id]/cancel-inspect
 *
 * - 從 PENDING 直接選驗收者 → 退回 PENDING，清掉所有鎖定/身份
 * - 揀貨者交棒後、驗收者接鎖 → 清掉 inspectorId，退回 unlocked INSPECTING
 * - 揀貨者自己想退出且尚無驗收者 → 退回 PENDING
 */

import { AcceptMethod, DocumentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.inspect");
  if (f) return f;

  const { id } = await ctx.params;
  const doc = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: {
      status: true,
      lockedByUserId: true,
      inspectorId: true,
      pickerId: true,
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "找不到單據" }, { status: 404 });
  }
  if (doc.status !== DocumentStatus.INSPECTING) {
    return NextResponse.json(
      { error: "僅驗收中單據可取消驗收身份" },
      { status: 400 },
    );
  }
  if (doc.lockedByUserId && doc.lockedByUserId !== u.id) {
    return NextResponse.json(
      { error: "單據由其他人鎖定，無法取消" },
      { status: 409 },
    );
  }

  const docMeta = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: { documentNumber: true },
  });
  const isInspector = doc.inspectorId === u.id;
  const isPicker = doc.pickerId === u.id;

  if (!isInspector && !isPicker) {
    return NextResponse.json(
      { error: "您不是此單據的揀貨者或驗收者" },
      { status: 403 },
    );
  }

  if (isInspector && !doc.pickerId) {
    // 沒有揀貨者 → 整張退回 PENDING
    await prisma.inspectionDoc.update({
      where: { id },
      data: {
        status: DocumentStatus.PENDING,
        lockedByUserId: null,
        lockedAt: null,
        inspectorId: null,
        acceptMethod: AcceptMethod.BARCODE,
      },
    });
  } else if (isInspector && doc.pickerId) {
    // 有揀貨者 → 只清驗收者，回到 unlocked INSPECTING
    await prisma.inspectionDoc.update({
      where: { id },
      data: {
        lockedByUserId: null,
        lockedAt: null,
        inspectorId: null,
        acceptMethod: AcceptMethod.MANUAL,
      },
    });
  } else if (isPicker && !doc.inspectorId) {
    // 揀貨者退出且沒驗收者 → 退回 PENDING
    await prisma.inspectionDoc.update({
      where: { id },
      data: {
        status: DocumentStatus.PENDING,
        lockedByUserId: null,
        lockedAt: null,
        pickerId: null,
        acceptMethod: AcceptMethod.BARCODE,
      },
    });
  } else {
    return NextResponse.json(
      { error: "已有驗收者，揀貨者無法直接取消" },
      { status: 400 },
    );
  }

  await writeAudit({
    user: u,
    action: "doc.cancel-inspect",
    targetType: "InspectionDoc",
    targetId: id,
    targetLabel: docMeta?.documentNumber ?? undefined,
    summary: `取消驗收身份（${isInspector ? "驗收者" : "揀貨者"}）`,
    meta: {
      role: isInspector ? "INSPECTOR" : "PICKER",
      hadPicker: Boolean(doc.pickerId),
      hadInspector: Boolean(doc.inspectorId),
    },
  });
  return NextResponse.json({ ok: true });
}
