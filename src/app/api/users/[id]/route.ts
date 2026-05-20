/**
 * 員工／使用者：單筆維護
 * 對應 URL：/api/users/[id]
 */

import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { usernameSchema } from "@/lib/username";
import { writeAudit } from "@/lib/audit";

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.nativeEnum(Role).optional(),
    password: z.string().min(6).optional(),
    username: usernameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.role !== undefined ||
      d.password !== undefined ||
      d.username !== undefined ||
      d.isActive !== undefined,
    { message: "至少需要一個欄位" },
  );

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "employees.manage");
  if (f) return f;

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const {
    name,
    role,
    password,
    username: newUsername,
    isActive,
  } = parsed.data;
  if (
    role !== undefined &&
    role !== Role.ADMIN &&
    target.role === Role.ADMIN
  ) {
    const adminCount = await prisma.user.count({
      where: { role: Role.ADMIN },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "至少需保留一名管理者" },
        { status: 400 },
      );
    }
  }
  if (isActive === false && target.role === Role.ADMIN) {
    const activeAdminCount = await prisma.user.count({
      where: { role: Role.ADMIN, isActive: true },
    });
    if (activeAdminCount <= 1) {
      return NextResponse.json(
        { error: "至少需保留一名啟用的管理者" },
        { status: 400 },
      );
    }
  }

  const data: {
    name?: string;
    role?: Role;
    passwordHash?: string;
    username?: string;
    isActive?: boolean;
  } = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (newUsername !== undefined) data.username = newUsername;
  if (isActive !== undefined) data.isActive = isActive;
  if (password !== undefined) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const changes: string[] = [];
    if (newUsername !== undefined && newUsername !== target.username) {
      changes.push(`帳號 ${target.username}→${newUsername}`);
    }
    if (name !== undefined && name !== target.name) changes.push(`姓名 ${target.name}→${name}`);
    if (role !== undefined && role !== target.role) changes.push(`角色 ${target.role}→${role}`);
    if (isActive !== undefined && isActive !== target.isActive) {
      changes.push(isActive ? "啟用" : "停用");
    }
    if (password !== undefined) changes.push("重設密碼");
    await writeAudit({
      user: u,
      action: "user.update",
      targetType: "User",
      targetId: id,
      targetLabel: `${updated.name}（${updated.username}）`,
      summary: changes.length ? changes.join("、") : "更新員工資料",
      meta: {
        before: {
          username: target.username,
          name: target.name,
          role: target.role,
          isActive: target.isActive,
        },
        after: {
          username: updated.username,
          name: updated.name,
          role: updated.role,
          isActive: updated.isActive,
        },
        passwordReset: password !== undefined,
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "帳號已被使用" }, { status: 409 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "employees.manage");
  if (f) return f;

  const { id } = await ctx.params;
  if (u.id === id) {
    return NextResponse.json({ error: "不可刪除自己" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (target.role === Role.ADMIN) {
    const adminCount = await prisma.user.count({
      where: { role: Role.ADMIN },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "至少需保留一名管理者" },
        { status: 400 },
      );
    }
    if (target.isActive) {
      const activeAdminCount = await prisma.user.count({
        where: { role: Role.ADMIN, isActive: true },
      });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "至少需保留一名啟用的管理者" },
          { status: 400 },
        );
      }
    }
  }

  await prisma.$transaction([
    prisma.inspectionDoc.updateMany({
      where: { inspectorId: id },
      data: { inspectorId: null },
    }),
    prisma.inspectionDoc.updateMany({
      where: { pickerId: id },
      data: { pickerId: null },
    }),
    prisma.inspectionDoc.updateMany({
      where: { lockedByUserId: id },
      data: { lockedByUserId: null, lockedAt: null },
    }),
    prisma.user.delete({ where: { id } }),
  ]);

  await writeAudit({
    user: u,
    action: "user.delete",
    targetType: "User",
    targetId: id,
    targetLabel: `${target.name}（${target.username}）`,
    summary: `刪除員工 ${target.name}（${target.username}） 角色=${target.role}`,
    meta: { role: target.role, username: target.username, name: target.name },
  });
  return NextResponse.json({ ok: true });
}
