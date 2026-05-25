/**
 * 敏感操作前再次驗證目前登入者密碼。
 */
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function verifyUserPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, isActive: true },
  });
  if (!row?.isActive) return false;
  return bcrypt.compare(password, row.passwordHash);
}

export async function requireConfirmPassword(
  userId: string,
  confirmPassword: unknown,
): Promise<NextResponse | null> {
  const pw =
    typeof confirmPassword === "string" ? confirmPassword.trim() : "";
  if (!pw) {
    return NextResponse.json(
      { error: "請輸入目前密碼以確認此操作" },
      { status: 400 },
    );
  }
  const ok = await verifyUserPassword(userId, pw);
  if (!ok) {
    return NextResponse.json({ error: "密碼確認失敗" }, { status: 403 });
  }
  return null;
}
