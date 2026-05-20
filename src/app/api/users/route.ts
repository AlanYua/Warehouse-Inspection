/**
 * 員工／使用者：列表與新增
 * 對應 URL：/api/users
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

const createSchema = z.object({
  username: usernameSchema,
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.nativeEnum(Role),
});

export async function GET() {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "employees.manage");
  if (f) return f;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
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
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "employees.manage");
  if (f) return f;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { username, password, name, role } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const created = await prisma.user.create({
      data: { username, passwordHash, name, role, isActive: true },
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
    await writeAudit({
      user: u,
      action: "user.create",
      targetType: "User",
      targetId: created.id,
      targetLabel: `${created.name}（${created.username}）`,
      summary: `新增員工 ${created.name}（${created.username}） 角色=${created.role}`,
      meta: { role: created.role, username: created.username, name: created.name },
    });
    return NextResponse.json(created);
  } catch {
    return NextResponse.json({ error: "帳號已被使用" }, { status: 409 });
  }
}
