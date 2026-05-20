import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 公開存活探針：給 Docker / Uptime / Cloudflare（勿快取） */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "ok",
      now: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
