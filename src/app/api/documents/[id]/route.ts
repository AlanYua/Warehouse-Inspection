/**
 * 驗收單據：單筆讀取與更新
 * 對應 URL：/api/documents/[id]
 */

import { AcceptMethod, DocumentFlow, DocumentStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { canDeleteDocument } from "@/lib/documents/delete-guard";
import { assertCanEditDoc } from "@/lib/documents/lock";
import { inspectionDocDetailInclude } from "@/lib/documents/doc-detail-include";
import { syncLineStorageFromProducts } from "@/lib/documents/syncLineStorageFromProducts";
import { writeAudit } from "@/lib/audit";
import { requireConfirmPassword } from "@/lib/reauth";
import { z } from "zod";

async function syncDocCounterpartyFromChannel(doc: {
  id: string;
  channelCode: string | null;
  counterpartyName: string | null;
  phone: string | null;
  address: string | null;
  lingyueCode: string | null;
}): Promise<boolean> {
  const chCode = (doc.channelCode ?? "").trim();
  if (!chCode) return false;
  const needName = !(doc.counterpartyName ?? "").trim();
  const needPhone = !(doc.phone ?? "").trim();
  const needAddr = !(doc.address ?? "").trim();
  const needLy = !(doc.lingyueCode ?? "").trim();
  if (!needName && !needPhone && !needAddr && !needLy) return false;

  const ch = await prisma.channel.findUnique({
    where: { channelCode: chCode },
    select: { name: true, phone: true, address: true, lingyueCode: true },
  });
  if (!ch) return false;

  await prisma.inspectionDoc.update({
    where: { id: doc.id },
    data: {
      ...(needName ? { counterpartyName: ch.name } : {}),
      ...(needPhone && ch.phone ? { phone: ch.phone } : {}),
      ...(needAddr && ch.address ? { address: ch.address } : {}),
      ...(needLy && ch.lingyueCode ? { lingyueCode: ch.lingyueCode } : {}),
    },
  });
  return true;
}

const patchSchema = z.object({
  acceptMethod: z.nativeEnum(AcceptMethod).optional(),
  lines: z
    .array(
      z.object({
        id: z.string(),
        inspectQuantity: z.number().optional(),
        pickerPicked: z.boolean().optional(),
        remark: z.string().nullable().optional(),
        storageLocation: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fg = forbidIfNoPermission(u.role, "documents.view");
  if (fg) return fg;
  const { id } = await ctx.params;
  const doc = await prisma.inspectionDoc.findUnique({
    where: { id },
    include: inspectionDocDetailInclude,
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const docChanged = await syncDocCounterpartyFromChannel(doc);
  const linesChanged = await syncLineStorageFromProducts(doc.lines);

  if (!docChanged && !linesChanged) {
    return NextResponse.json(doc);
  }

  const docFresh = await prisma.inspectionDoc.findUnique({
    where: { id },
    include: inspectionDocDetailInclude,
  });
  return NextResponse.json(docFresh!);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fg = forbidIfNoPermission(u.role, "documents.inspect");
  if (fg) return fg;

  const { id } = await ctx.params;
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const admin = u.role === Role.ADMIN;
  const check = await assertCanEditDoc(id, u.id, admin);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.message, lockedByName: "lockedByName" in check ? check.lockedByName : undefined },
      { status: check.status },
    );
  }

  const docSnap = check.doc;
  const pickerOnlyPhase =
    docSnap &&
    docSnap.flow === DocumentFlow.OUT &&
    docSnap.status === DocumentStatus.INSPECTING &&
    docSnap.inspectorId == null &&
    docSnap.pickerId != null &&
    docSnap.pickerId === u.id &&
    !admin;

  const { acceptMethod, lines } = body.data;

  if (pickerOnlyPhase && acceptMethod) {
    return NextResponse.json(
      { error: "揀貨階段不可變更驗收核對方式" },
      { status: 400 },
    );
  }
  if (acceptMethod) {
    await prisma.inspectionDoc.update({
      where: { id },
      data: { acceptMethod },
    });
  }

  if (lines?.length) {
    if (pickerOnlyPhase) {
      const badQty = lines.some((l) => l.inspectQuantity !== undefined);
      if (badQty) {
        return NextResponse.json(
          { error: "揀貨者不可直接修改驗收量，請勾選「揀過」" },
          { status: 400 },
        );
      }
      if (lines.some((l) => l.storageLocation !== undefined)) {
        return NextResponse.json(
          { error: "揀貨階段不可修改儲位" },
          { status: 400 },
        );
      }
    }

    const pickedEdits = lines.filter((l) => l.pickerPicked !== undefined);
    if (pickedEdits.length) {
      const allowPick =
        admin ||
        (docSnap &&
          docSnap.flow === DocumentFlow.OUT &&
          docSnap.status === DocumentStatus.INSPECTING &&
          docSnap.inspectorId == null &&
          docSnap.pickerId === u.id);
      if (!allowPick) {
        return NextResponse.json(
          { error: "僅揀貨者可更新「揀過」" },
          { status: 403 },
        );
      }
    }

    const qtyEdits = lines.filter(
      (l) => l.inspectQuantity !== undefined,
    ) as Array<{ id: string; inspectQuantity: number }>;
    if (qtyEdits.length) {
      const lineRows = await prisma.documentLine.findMany({
        where: { documentId: id, id: { in: qtyEdits.map((x) => x.id) } },
        select: { id: true, docQuantity: true },
      });
      const docQtyById = new Map(lineRows.map((r) => [r.id, r.docQuantity]));
      const invalid = qtyEdits
        .map((e) => ({
          id: e.id,
          inspectQuantity: e.inspectQuantity,
          docQuantity: docQtyById.get(e.id),
        }))
        .filter(
          (x) =>
            x.docQuantity !== undefined && x.inspectQuantity > x.docQuantity,
        );
      if (invalid.length) {
        return NextResponse.json(
          {
            error: "驗收量不可大於單據量",
            details: invalid,
          },
          { status: 400 },
        );
      }
    }

    const ops = lines
      .map((ln) => {
        const data: {
          inspectQuantity?: number;
          pickerPicked?: boolean;
          remark?: string | null;
          storageLocation?: string | null;
        } = {};
        if (ln.inspectQuantity !== undefined) data.inspectQuantity = ln.inspectQuantity;
        if (ln.pickerPicked !== undefined) data.pickerPicked = ln.pickerPicked;
        if (ln.remark !== undefined) data.remark = ln.remark;
        if (ln.storageLocation !== undefined) data.storageLocation = ln.storageLocation;
        if (Object.keys(data).length === 0) return null;
        return prisma.documentLine.updateMany({
          where: { id: ln.id, documentId: id },
          data,
        });
      })
      .filter(Boolean);
    if (ops.length > 0) {
      await Promise.all(ops);
    }
  }

  const doc = await prisma.inspectionDoc.findUnique({
    where: { id },
    include: inspectionDocDetailInclude,
  });
  const qtyChanges = (lines ?? []).filter((l) => l.inspectQuantity !== undefined).length;
  const pickedChanges = (lines ?? []).filter((l) => l.pickerPicked !== undefined).length;
  const remarkChanges = (lines ?? []).filter((l) => l.remark !== undefined).length;
  const storageChanges = (lines ?? []).filter((l) => l.storageLocation !== undefined).length;
  if (acceptMethod || qtyChanges || pickedChanges || remarkChanges || storageChanges) {
    const parts: string[] = [];
    if (acceptMethod) {
      parts.push(
        acceptMethod === "BARCODE" ? "驗收方式：條碼驗收" : "驗收方式：手動驗收",
      );
    }
    if (qtyChanges) parts.push(`驗收量×${qtyChanges}`);
    if (pickedChanges) parts.push(`揀過×${pickedChanges}`);
    if (remarkChanges) parts.push(`備註×${remarkChanges}`);
    if (storageChanges) parts.push(`儲位×${storageChanges}`);
    await writeAudit({
      user: u,
      action: "doc.patch",
      targetType: "InspectionDoc",
      targetId: id,
      targetLabel: doc?.documentNumber ?? undefined,
      summary: `編輯驗收（${parts.join("、")}）`,
      meta: {
        acceptMethod: acceptMethod ?? null,
        qtyChanges,
        pickedChanges,
        remarkChanges,
        storageChanges,
      },
    });
  }
  return NextResponse.json(doc);
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fg = forbidIfNoPermission(u.role, "documents.delete");
  if (fg) return fg;

  const body = (await req.json().catch(() => ({}))) as {
    confirmPassword?: string;
  };
  const reauth = await requireConfirmPassword(u.id, body.confirmPassword);
  if (reauth) return reauth;

  const { id } = await ctx.params;
  const target = await prisma.inspectionDoc.findUnique({
    where: { id },
    select: {
      documentNumber: true,
      documentType: true,
      channelCode: true,
      status: true,
      stockedAt: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const delCheck = canDeleteDocument(u.role, target);
  if (!delCheck.ok) {
    return NextResponse.json({ error: delCheck.message }, { status: 403 });
  }
  try {
    await prisma.inspectionDoc.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await writeAudit({
    user: u,
    action: "doc.delete",
    targetType: "InspectionDoc",
    targetId: id,
    targetLabel: target?.documentNumber ?? id,
    summary: "刪除單據",
    meta: target ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
