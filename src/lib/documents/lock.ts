/**
 * 驗收單據「同一時間僅一人鎖定」的交易式邏輯：取得鎖、交棒、過期搶鎖、狀態檢查。
 */
import type { InspectionDoc } from "@prisma/client";
import { AcceptMethod, DocumentFlow, DocumentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lockExpired } from "@/lib/doc-lock";

type DocWithLocker = InspectionDoc & {
  lockedBy?: { name: string } | null;
};

export type LockResult =
  | { ok: true; doc: InspectionDoc }
  | {
      ok: false;
      status: 409;
      message: string;
      lockedByName?: string;
    }
  | { ok: false; status: 403 | 404; message: string };

export type InspectAs = "PICKER" | "INSPECTOR";

export async function acquireOrTouchLock(
  docId: string,
  userId: string,
  inspectAs?: InspectAs,
): Promise<LockResult> {
  const result = await prisma.$transaction(async (tx) => {
    const doc = await tx.inspectionDoc.findUnique({
      where: { id: docId },
      include: { lockedBy: { select: { id: true, name: true } } },
    });
    if (!doc) return { type: "nf" as const };
    if (doc.status === DocumentStatus.SHIPPED) {
      return { type: "bad" as const, message: "已出貨，無法驗收" };
    }
    if (doc.status === DocumentStatus.COMPLETED) {
      return { type: "bad" as const, message: "已完成驗收，無法再次鎖定" };
    }

    async function wouldClaimNewLockOnThisDoc(): Promise<boolean> {
      if (doc!.lockedByUserId === userId) return false;
      if (doc!.status === DocumentStatus.PENDING) return true;
      if (doc!.status !== DocumentStatus.INSPECTING) return false;
      if (!doc!.lockedByUserId) return true;
      const stale =
        doc!.lockedAt != null && lockExpired(doc!.lockedAt);
      return stale;
    }

    if (await wouldClaimNewLockOnThisDoc()) {
      const other = await tx.inspectionDoc.count({
        where: {
          id: { not: docId },
          status: DocumentStatus.INSPECTING,
          lockedByUserId: userId,
        },
      });
      if (other > 0) {
        return { type: "busy" as const };
      }
    }

    if (doc.status === DocumentStatus.PENDING) {
      const inFlow = doc.flow === DocumentFlow.IN;
      let chosen = inspectAs;
      if (!chosen) {
        if (inFlow) chosen = "INSPECTOR";
        else return { type: "bad" as const, message: "請選擇揀貨或驗收身份" };
      }
      if (inFlow && chosen === "PICKER") {
        return {
          type: "bad" as const,
          message: "驗入單據僅由檢驗者驗收，無揀貨階段",
        };
      }
      const isPicker = !inFlow && chosen === "PICKER";
      const next = await tx.inspectionDoc.update({
        where: { id: docId },
        data: {
          status: DocumentStatus.INSPECTING,
          lockedByUserId: userId,
          lockedAt: new Date(),
          acceptMethod: isPicker ? AcceptMethod.MANUAL : AcceptMethod.BARCODE,
          pickerId: isPicker ? userId : null,
          inspectorId: isPicker ? null : userId,
        },
      });
      return { type: "ok" as const, doc: next };
    }

    if (doc.status === DocumentStatus.INSPECTING) {
      // 已有鎖：同一人續鎖
      if (doc.lockedByUserId === userId) {
        const next = await tx.inspectionDoc.update({
          where: { id: docId },
          data: { lockedAt: new Date() },
        });
        return { type: "ok" as const, doc: next };
      }

      // 刻意交棒後無持有人：須帶 inspectAs，不得與過期搶鎖混用
      if (!doc.lockedByUserId) {
        const inFlow = doc.flow === DocumentFlow.IN;
        let chosen = inspectAs;
        if (!chosen) {
          if (inFlow) chosen = "INSPECTOR";
          else {
            return {
              type: "bad" as const,
              message: "請選擇揀貨或驗收身份",
            };
          }
        }
        if (inFlow && chosen === "PICKER") {
          return {
            type: "bad" as const,
            message: "驗入單據僅由檢驗者驗收，無揀貨階段",
          };
        }
        if (!inFlow && chosen === "PICKER") {
          if (doc.inspectorId) {
            return {
              type: "bad" as const,
              message: "驗收已開始，揀貨者無法再接鎖",
            };
          }
          if (doc.pickerId && doc.pickerId !== userId) {
            return {
              type: "bad" as const,
              message: "請由原揀貨者接鎖",
            };
          }
          const next = await tx.inspectionDoc.update({
            where: { id: docId },
            data: {
              lockedByUserId: userId,
              lockedAt: new Date(),
              acceptMethod: AcceptMethod.MANUAL,
              pickerId: userId,
            },
          });
          return { type: "ok" as const, doc: next };
        }
        // INSPECTOR（驗入僅此路徑）
        if (doc.inspectorId && doc.inspectorId !== userId) {
          return {
            type: "bad" as const,
            message: "請由原驗收者接鎖",
          };
        }
        const next = await tx.inspectionDoc.update({
          where: { id: docId },
          data: {
            lockedByUserId: userId,
            lockedAt: new Date(),
            acceptMethod: AcceptMethod.BARCODE,
            inspectorId: doc.inspectorId ?? userId,
          },
        });
        return { type: "ok" as const, doc: next };
      }

      // 他人鎖定：僅鎖定過期可搶（依單據是否已有驗收者判斷接棒身份，勿用 acceptMethod：驗收者手打會變 MANUAL）
      const stale = doc.lockedAt != null && lockExpired(doc.lockedAt);
      if (stale) {
        const next = await tx.inspectionDoc.update({
          where: { id: docId },
          data: {
            lockedByUserId: userId,
            lockedAt: new Date(),
            ...(doc.flow === DocumentFlow.IN
              ? { inspectorId: userId }
              : doc.inspectorId != null
                ? { inspectorId: userId }
                : doc.pickerId != null
                  ? { pickerId: userId }
                  : { inspectorId: userId }),
          },
        });
        return { type: "ok" as const, doc: next };
      }

      return {
        type: "conflict" as const,
        name: doc.lockedBy?.name ?? "其他人",
      };
    }

    return { type: "bad" as const, message: "無法取得鎖定" };
  });

  if (result.type === "nf") {
    return { ok: false, status: 404, message: "找不到單據" };
  }
  if (result.type === "conflict") {
    return {
      ok: false,
      status: 409,
      message: "此單據由其他人驗收中",
      lockedByName: result.name,
    };
  }
  if (result.type === "busy") {
    return {
      ok: false,
      status: 409,
      message:
        "您已鎖定其他驗收中單據，請先交棒、完成驗收或解鎖後再開新單",
    };
  }
  if (result.type === "bad") {
    return { ok: false, status: 403, message: result.message };
  }
  const full = await prisma.inspectionDoc.findUnique({
    where: { id: docId },
  });
  if (!full) return { ok: false, status: 404, message: "找不到單據" };
  return { ok: true, doc: full };
}

export async function assertCanEditDoc(
  docId: string,
  userId: string,
  isAdmin: boolean,
): Promise<LockResult & { doc?: DocWithLocker }> {
  const doc = await prisma.inspectionDoc.findUnique({
    where: { id: docId },
    include: { lockedBy: { select: { name: true } } },
  });
  if (!doc) return { ok: false, status: 404, message: "找不到單據" };
  if (doc.status === DocumentStatus.SHIPPED) {
    return { ok: false, status: 403, message: "已出貨不可編輯" };
  }
  if (doc.status === DocumentStatus.COMPLETED) {
    return {
      ok: false,
      status: 403,
      message: "已完成驗收，無法修改明細（可標記出貨）",
    };
  }
  if (doc.status === DocumentStatus.PENDING) {
    return { ok: true, doc };
  }
  if (isAdmin) return { ok: true, doc };
  if (doc.lockedByUserId !== userId) {
    return {
      ok: false,
      status: 409,
      message: "驗收中且非您鎖定",
      lockedByName: doc.lockedBy?.name,
    };
  }
  return { ok: true, doc };
}
