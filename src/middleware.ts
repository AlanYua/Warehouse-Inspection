/**
 * 路由保護：未登入 → /login；已登入訪問 /login → /。
 * 使用 getToken（Edge 安全），勿 import auth.ts（含 prisma/bcrypt）。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  clearAuthSessionCookies,
  isSessionIdleExpired,
} from "@/lib/session-idle";

export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: req.nextUrl.protocol === "https:",
  });
  const idleExpired = isSessionIdleExpired(token?.lastActivity);
  if (idleExpired) {
    const url = new URL("/login", req.url);
    url.searchParams.set("reason", "idle");
    const res = NextResponse.redirect(url);
    clearAuthSessionCookies(res, req);
    const userId = (token?.id as string | undefined) ?? token?.sub;
    if (userId) {
      res.cookies.set("wi-idle-audit", userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 120,
      });
    }
    return res;
  }
  const loggedIn = !!token?.sub && !token?.expired;
  const path = req.nextUrl.pathname;
  const isLogin = path.startsWith("/login");

  if (!loggedIn && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (loggedIn && isLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
