/**
 * 驗收單據：標記出貨
 * 對應 URL：/api/documents/[id]/ship
 */

import { DocumentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { writeAudit } from "@/lib/audit";
import { resolveShipDelivery } from "@/lib/documents/ship-delivery";
import { z } from "zod";

const shipBody = z.object({
  pickerId: z.string().min(1).optional(),
  selfPickup: z.boolean().optional(),
  warehouseDelivery: z.boolean().optional(),
  logisticsNo: z.string().trim().min(1).optional(),
  packageCountA: z.number().int().nonnegative().optional(),
  packageCountC: z.number().int().nonnegative().optional(),
  packageSize: z.string().trim().min(1).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "documents.ship");
  if (f) return f;
  const { id } = await ctx.params;
  const parsed = shipBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "請勾選自取、倉庫親送或填寫物流單號" },
      { status: 400 },
    );
  }
  const {
    pickerId,
    selfPickup,
    warehouseDelivery,
    logisticsNo,
    packageCountA: bodyA,
    packageCountC: bodyC,
    packageSize,
  } = parsed.data;
  const before = await prisma.inspectionDoc.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "找不到單據" }, { status: 404 });
  }
  if (before.status !== DocumentStatus.COMPLETED) {
    return NextResponse.json(
      { error: "需先完成驗收始可出貨" },
      { status: 400 },
    );
  }

  const resolvedPickerId = pickerId ?? before.pickerId ?? u.id;
  const picker = await prisma.user.findUnique({ where: { id: resolvedPickerId } });
  if (!picker) {
    return NextResponse.json({ error: "揀貨人不存在" }, { status: 400 });
  }

  const packageCountA = bodyA ?? before.packageCountA ?? 0;
  const packageCountC = bodyC ?? before.packageCountC ?? 0;
  const packageCount = packageCountA + packageCountC;
  const delivery = resolveShipDelivery({
    selfPickup,
    warehouseDelivery,
    logisticsNo,
  });
  if (!delivery.ok) {
    return NextResponse.json({ error: delivery.error }, { status: 400 });
  }
  const {
    logisticsNo: resolvedLogisticsNo,
    selfPickup: isSelfPickup,
    warehouseDelivery: isWarehouseDelivery,
    skipPackageCount,
  } = delivery;
  if (!skipPackageCount && packageCount <= 0) {
    return NextResponse.json(
      { error: "此單據尚未填寫 A/C 箱數，無法出貨" },
      { status: 400 },
    );
  }
  await prisma.inspectionDoc.update({
    where: { id },
    data: {
      status: DocumentStatus.SHIPPED,
      pickerId: resolvedPickerId,
      logisticsNo: resolvedLogisticsNo,
      packageCount,
      packageCountA,
      packageCountC,
      packageSize: packageSize ? packageSize : null,
      shippedAt: new Date(),
      lockedByUserId: null,
      lockedAt: null,
    },
  });
  const out = await prisma.inspectionDoc.findUnique({
    where: { id },
    include: {
      lines: true,
      department: true,
      inspector: { select: { id: true, name: true, username: true } },
      picker: { select: { id: true, name: true, username: true } },
    },
  });
  await writeAudit({
    user: u,
    action: "doc.ship",
    targetType: "InspectionDoc",
    targetId: id,
    targetLabel: out?.documentNumber ?? before.documentNumber,
    summary: `出貨（${
      isSelfPickup
        ? "自取"
        : isWarehouseDelivery
          ? "倉庫親送"
          : `物流 ${resolvedLogisticsNo}`
    }，共 ${packageCount} 件）`,
    meta: {
      logisticsNo: resolvedLogisticsNo,
      selfPickup: isSelfPickup,
      warehouseDelivery: isWarehouseDelivery,
      packageCount,
      packageCountA,
      packageCountC,
      packageSize: packageSize ?? null,
      pickerId: resolvedPickerId,
      pickerName: picker.name,
    },
  });
  return NextResponse.json(out);
}
