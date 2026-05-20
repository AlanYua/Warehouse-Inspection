/**
 * NextAuth v5：Credentials ＋ JWT session，自訂 token 帶入 id / role / username。
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "帳號", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const username = credentials?.username;
        const password = credentials?.password;
        if (!username || !password) return null;
        const user = await prisma.user.findUnique({
          where: { username: String(username).trim() },
        });
        if (!user) return null;
        if (!user.isActive) return null;
        const ok = await bcrypt.compare(String(password), user.passwordHash);
        if (!ok) return null;
        const ip =
          (request as Request | undefined)?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          (request as Request | undefined)?.headers.get("x-real-ip") ||
          null;
        await writeAudit({
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
          action: "auth.login",
          targetType: "User",
          targetId: user.id,
          targetLabel: user.name,
          summary: `${user.name} 登入系統`,
          ip,
        });
        return {
          id: user.id,
          name: user.name,
          role: user.role,
          username: user.username,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user && user.id) {
        token.id = user.id;
        token.role = user.role as Role;
        token.username =
          "username" in user && typeof user.username === "string"
            ? user.username
            : "";
      } else if (token.id && !String(token.username ?? "").trim()) {
        const row = await prisma.user.findUnique({
          where: { id: String(token.id) },
          select: { username: true },
        });
        if (row) token.username = row.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.username = (token.username as string) ?? "";
      }
      return session;
    },
  },
});
