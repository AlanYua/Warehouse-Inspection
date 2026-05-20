/**
 * NextAuth：登入／工作階段 API
 * 對應 URL：/api/auth/[...nextauth]
 *
 * POST /api/auth/callback/credentials 加上 rate limiting
 * 防止暴力破解密碼（同一 IP 每分鐘最多 10 次登入嘗試）。
 */

import { handlers } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

export const { GET } = handlers;

export async function POST(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
  const segments = await ctx.params;
  const path = segments.nextauth?.join("/") ?? "";

  if (path === "callback/credentials") {
    const ip = getClientIp(req);
    const result = rateLimit(`auth:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "登入嘗試過於頻繁，請稍後再試" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
          },
        },
      );
    }
  }

  return handlers.POST(req);
}
