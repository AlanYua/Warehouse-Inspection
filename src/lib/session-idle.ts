/**
 * Session 閒置逾時：2 小時未操作自動登出並清除 cookie。
 */
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;

export const SESSION_IDLE_LABEL = "2 小時";

/** 舊 JWT 無 lastActivity 時視為 0，強制重新登入。 */
export function effectiveLastActivityMs(lastActivity: unknown): number {
  return typeof lastActivity === "number" && Number.isFinite(lastActivity)
    ? lastActivity
    : 0;
}

export function isSessionIdleExpired(
  lastActivity: unknown,
  now = Date.now(),
): boolean {
  const lastActivityMs = effectiveLastActivityMs(lastActivity);
  return now - lastActivityMs > SESSION_IDLE_MS;
}

export function clearAuthSessionCookies(
  res: NextResponse,
  req: NextRequest,
): void {
  const secure = req.nextUrl.protocol === "https:";
  const names = secure
    ? ["__Secure-authjs.session-token", "authjs.session-token"]
    : ["authjs.session-token"];
  for (const name of names) {
    res.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
}
