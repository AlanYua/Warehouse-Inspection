/**
 * Session 閒置逾時：30 分鐘未操作自動登出並清除 cookie。
 */
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_IDLE_MS = 30 * 60 * 1000;

export const SESSION_IDLE_LABEL = "30 分鐘";

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

/** 反向代理（Coolify / Traefik）後用 x-forwarded-proto 判斷 HTTPS。 */
export function isSecureRequest(req: NextRequest): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim().toLowerCase() === "https";
  }
  return req.nextUrl.protocol === "https:";
}

export function clearAuthSessionCookies(
  res: NextResponse,
  req: NextRequest,
): void {
  const secure = isSecureRequest(req);
  const names = secure
    ? ["__Secure-authjs.session-token", "authjs.session-token"]
    : ["authjs.session-token", "__Secure-authjs.session-token"];
  for (const name of names) {
    res.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
}
