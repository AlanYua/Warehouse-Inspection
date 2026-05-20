/**
 * API 層共用的登入者取得與權限拒答（401/403）。
 * Server Actions／Route Handler 可先 requireApiUser 再 forbidIfNoPermission。
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import type { Permission } from "./permissions";
import { can } from "./permissions";

export type SessionUser = {
  id: string;
  username: string;
  name?: string | null;
  role: Role;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (
    !session?.user?.id ||
    !session.user.role ||
    !(session.user.username ?? "").trim()
  ) {
    return null;
  }
  return {
    id: session.user.id,
    username: session.user.username ?? "",
    name: session.user.name,
    role: session.user.role,
  };
}

export async function requireApiUser(): Promise<
  SessionUser | NextResponse
> {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return u;
}

export function forbidIfNoPermission(
  role: Role,
  permission: Permission,
): NextResponse | null {
  if (!can(role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
