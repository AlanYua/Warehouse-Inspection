/**
 * 登出／閒置登出前寫入操作紀錄（須仍為有效 session）。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/api-guard";
import {
  clientIpFromRequest,
  writeAuthSessionAudit,
  type AuthAuditType,
} from "@/lib/auth-audit";

const bodySchema = z.object({
  type: z.enum(["logout", "idle"]),
});

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await writeAuthSessionAudit({
    type: parsed.data.type as AuthAuditType,
    userId: u.id,
    ip: clientIpFromRequest(req),
  });
  return NextResponse.json({ ok: true });
}
