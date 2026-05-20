import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-guard";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "ok",
      now: new Date().toISOString(),
    });
  } catch (e) {
    log.error("health-db", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json(
      { ok: false, db: "error" },
      { status: 500 },
    );
  }
}

