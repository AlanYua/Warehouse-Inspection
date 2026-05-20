/**
 * 操作紀錄寫入 helper。寫入失敗只記 log，不阻斷主流程；主流程一律以「業務成功」為前提才呼叫。
 * 用法：
 *   import { writeAudit } from "@/lib/audit";
 *   await writeAudit({ user: u, action: "doc.complete", targetType: "InspectionDoc", targetId: doc.id, targetLabel: doc.documentNumber, summary: "完成驗收" });
 */

import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export type AuditAction =
  | "auth.login"
  | "doc.lock"
  | "doc.release-lock"
  | "doc.cancel-inspect"
  | "doc.unlock"
  | "doc.patch"
  | "doc.complete"
  | "doc.ship"
  | "doc.batch-ship"
  | "doc.stock"
  | "doc.delete"
  | "doc.batch-delete"
  | "doc.import"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "channel.create"
  | "channel.update"
  | "channel.delete"
  | "channel.batch-delete"
  | "channel.import"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "product.batch-delete"
  | "product.batch-storage"
  | "product.import"
  | "return.create"
  | "return.increment"
  | "department.create"
  | "department.update"
  | "department.delete"
  | "department.batch-delete"
  | "brand.create"
  | "brand.update"
  | "brand.delete"
  | "doctype.create"
  | "doctype.update"
  | "doctype.delete"
  | "setting.print"
  | "sync.config";

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  "auth.login": "登入系統",
  "doc.lock": "鎖定單據（取得驗收/揀貨）",
  "doc.release-lock": "交棒釋放鎖定",
  "doc.cancel-inspect": "取消驗收身份",
  "doc.unlock": "管理員解鎖單據",
  "doc.patch": "編輯驗收明細",
  "doc.complete": "完成驗收",
  "doc.ship": "出貨",
  "doc.batch-ship": "批次出貨",
  "doc.stock": "入庫上架",
  "doc.delete": "刪除單據",
  "doc.batch-delete": "批次刪除單據",
  "doc.import": "匯入單據",
  "user.create": "新增員工",
  "user.update": "編輯員工",
  "user.delete": "刪除員工",
  "channel.create": "新增/更新通路",
  "channel.update": "編輯通路",
  "channel.delete": "刪除通路",
  "channel.batch-delete": "批次刪除通路",
  "channel.import": "匯入通路",
  "product.create": "新增/更新商品",
  "product.update": "編輯商品",
  "product.delete": "刪除商品",
  "product.batch-delete": "批次刪除商品",
  "product.batch-storage": "批次更新商品儲位",
  "product.import": "匯入商品",
  "return.create": "新增退貨",
  "return.increment": "退貨件數+1",
  "department.create": "新增部門",
  "department.update": "編輯部門",
  "department.delete": "刪除部門",
  "department.batch-delete": "批次刪除部門",
  "brand.create": "新增品牌",
  "brand.update": "編輯品牌",
  "brand.delete": "刪除品牌",
  "doctype.create": "新增單據類型",
  "doctype.update": "編輯單據類型",
  "doctype.delete": "刪除單據類型",
  "setting.print": "更新列印抬頭",
  "sync.config": "更新同步設定",
};

export type AuditActor = {
  id: string;
  username?: string | null;
  name?: string | null;
  role: Role;
};

export type AuditInput = {
  user: AuditActor | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  summary?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
};

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.user?.id ?? null,
        username: input.user?.username ?? null,
        userName: input.user?.name ?? null,
        role: input.user?.role ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel ?? null,
        summary: input.summary ?? null,
        ...(input.meta != null
          ? { meta: input.meta as Prisma.InputJsonValue }
          : {}),
        ip: input.ip ?? null,
      },
    });
  } catch (e) {
    log.error("audit-write-fail", {
      action: input.action,
      targetId: input.targetId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
