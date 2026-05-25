/**
 * 登入／登出／閒置逾時操作紀錄。
 */
import type { Role } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export type AuthAuditType = "logout" | "idle";

export async function writeAuthSessionAudit(input: {
  type: AuthAuditType;
  userId: string;
  ip?: string | null;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, username: true, name: true, role: true },
  });
  if (!user) return;

  const action = input.type === "idle" ? "auth.idle" : "auth.logout";
  const summary =
    input.type === "idle"
      ? `${user.name} 閒置逾時登出`
      : `${user.name} 登出系統`;

  await writeAudit({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role as Role,
    },
    action,
    targetType: "User",
    targetId: user.id,
    targetLabel: user.name,
    summary,
    ip: input.ip ?? null,
  });
}

export function clientIpFromRequest(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}
