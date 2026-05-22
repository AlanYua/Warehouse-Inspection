/**
 * 驗收單據：標記驗收完成
 * 對應 URL：/api/documents/[id]/complete
 */

import { DocumentFlow, DocumentStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { assertCanEditDoc } from "@/lib/documents/lock";
import { inspectionDocDetailInclude } from "@/lib/documents/doc-detail-include";
import { syncLineStorageFromProducts } from "@/lib/documents/syncLineStorageFromProducts";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const completeBody = z.object({
  packageCountA: z.number().int().nonnegative().default(0),
  packageCountC: z.number().int().nonnegative().default(0),
});

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
  const admin = u.role === Role.ADMIN;
  const check = await assertCanEditDoc(id, u.id, admin);
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: check.status });
  }
  if (check.doc?.status !== DocumentStatus.INSPECTING) {
    return NextResponse.json(
      { error: "僅驗收中可完成驗收" },
      { status: 400 },
    );
  }
  if (
    !admin &&
    check.doc.lockedByUserId != null &&
    check.doc.lockedByUserId !== u.id
  ) {
    return NextResponse.json({ error: "僅鎖定者可完成驗收" }, { status: 409 });
  }

  const parsed = completeBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "完成驗收需填寫 A/C 箱數" },
      { status: 400 },
    );
  }
  const { packageCountA, packageCountC } = parsed.data;
  const packageCount = packageCountA + packageCountC;
  if (packageCount <= 0) {
    return NextResponse.json({ error: "A/C 件數需至少一項大於 0" }, { status: 400 });
  }

  const lines = await prisma.documentLine.findMany({
    where: { documentId: id },
    select: {
      id: true,
      productCode: true,
      productName: true,
      docQuantity: true,
      inspectQuantity: true,
      pickerPicked: true,
    },
  });
  const invalid = lines.filter((l) => l.inspectQuantity > l.docQuantity);
  if (invalid.length) {
    return NextResponse.json(
      {
        error: "驗收量不可大於單據量",
        details: invalid.map((l) => ({
          id: l.id,
          productCode: l.productCode,
          productName: l.productName,
          docQuantity: l.docQuantity,
          inspectQuantity: l.inspectQuantity,
          over: l.inspectQuantity - l.docQuantity,
        })),
      },
      { status: 400 },
    );
  }

  const docMeta = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: { inspectorId: true, pickerId: true, flow: true },
  });
  const pickerSkipInspector =
    docMeta?.flow === DocumentFlow.OUT &&
    docMeta?.inspectorId == null &&
    docMeta?.pickerId != null;
  if (pickerSkipInspector) {
    const notAllPicked = lines.some((l) => !l.pickerPicked);
    if (notAllPicked) {
      return NextResponse.json(
        { error: "略過驗收完成前，請先勾選所有品項「揀過」" },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (pickerSkipInspector) {
      await Promise.all(
        lines.map((l) =>
          tx.documentLine.update({
            where: { id: l.id },
            data: { inspectQuantity: l.docQuantity },
          }),
        ),
      );
    }
    await tx.inspectionDoc.update({
      where: { id },
      data: {
        status: DocumentStatus.COMPLETED,
        packageCount,
        packageCountA,
        packageCountC,
        lockedByUserId: null,
        lockedAt: null,
      },
    });
  });

  const lineRows = await prisma.documentLine.findMany({
    where: { documentId: id },
    select: { id: true, productCode: true, storageLocation: true },
  });
  await syncLineStorageFromProducts(lineRows);
  const doc = await prisma.inspectionDoc.findUnique({
    where: { id },
    include: inspectionDocDetailInclude,
  });
  await writeAudit({
    user: u,
    action: "doc.complete",
    targetType: "InspectionDoc",
    targetId: id,
    targetLabel: doc?.documentNumber ?? undefined,
    summary: `完成驗收（A:${packageCountA} / C:${packageCountC}，共 ${packageCount} 件）`,
    meta: {
      packageCount,
      packageCountA,
      packageCountC,
      flow: doc?.flow,
      documentType: doc?.documentType,
      channelCode: doc?.channelCode,
    },
  });
  return NextResponse.json(doc);
}
