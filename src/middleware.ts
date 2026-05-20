/**
 * Next.js Middleware — 路由層級驗證保護。
 * 未登入導向 /login；已登入訪問 /login 則導回首頁。API、靜態資源排除在 matcher 外。
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const loggedIn = !!req.auth;
  const path = req.nextUrl.pathname;
  const isLogin = path.startsWith("/login");
  if (!loggedIn && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (loggedIn && isLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
