/**
 * 路由保護：未登入 → /login；已登入訪問 /login → /。
 * 使用 getToken（Edge 安全），勿 import auth.ts（含 prisma/bcrypt）。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import {
  clearAuthSessionCookies,
  isSecureRequest,
  isSessionIdleExpired,
} from "@/lib/session-idle";

function isValidSession(token: JWT | null): boolean {
  if (!token?.sub || token.expired) return false;
  if (!token.role) return false;
  if (isSessionIdleExpired(token.lastActivity)) return false;
  return true;
}

export async function middleware(req: NextRequest) {
  const secure = isSecureRequest(req);
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: secure,
  });
  const path = req.nextUrl.pathname;
  const isLogin = path.startsWith("/login");
  const idleExpired = isSessionIdleExpired(token?.lastActivity);
  const sessionInvalid =
    !!token?.sub &&
    (token.expired === true || idleExpired || !token.role);

  if (sessionInvalid) {
    const res = isLogin
      ? NextResponse.next()
      : NextResponse.redirect(
          new URL(
            idleExpired ? "/login?reason=idle" : "/login",
            req.url,
          ),
        );
    clearAuthSessionCookies(res, req);
    const userId = (token?.id as string | undefined) ?? token?.sub;
    if (userId && idleExpired) {
      res.cookies.set("wi-idle-audit", userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 120,
        secure,
      });
    }
    return res;
  }

  const loggedIn = isValidSession(token);

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
