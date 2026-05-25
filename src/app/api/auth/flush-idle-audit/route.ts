/**
 * Middleware 閒置導向登入頁後，補寫 auth.idle（cookie 由 middleware 設定）。
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeAuthSessionAudit } from "@/lib/auth-audit";

const COOKIE = "wi-idle-audit";

export async function POST() {
  const jar = await cookies();
  const userId = jar.get(COOKIE)?.value?.trim();
  if (!userId) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  await writeAuthSessionAudit({ type: "idle", userId });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
