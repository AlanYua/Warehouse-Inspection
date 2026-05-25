/**
 * NextAuth v5：Credentials ＋ JWT session，自訂 token 帶入 id / role / username。
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { isSessionIdleExpired } from "@/lib/session-idle";

const authSecret =
  process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authSecret,
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
    maxAge: 60 * 60 * 2,
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user && "role" in user && user.id) {
        token.id = user.id;
        token.role = user.role as Role;
        token.username =
          "username" in user && typeof user.username === "string"
            ? user.username
            : "";
        token.lastActivity = Date.now();
        delete token.expired;
        return token;
      }

      if (isSessionIdleExpired(token.lastActivity)) {
        return { ...token, expired: true };
      }

      if (trigger === "update") {
        const ping = session?.lastActivity;
        if (typeof ping === "number" && Number.isFinite(ping)) {
          token.lastActivity = ping;
        }
      }

      if (token.id && !String(token.username ?? "").trim()) {
        const row = await prisma.user.findUnique({
          where: { id: String(token.id) },
          select: { username: true },
        });
        if (row) token.username = row.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.expired) {
        return {
          ...session,
          expires: new Date(0).toISOString(),
          user: {
            ...session.user,
            id: "",
            username: "",
          },
        };
      }
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.username = (token.username as string) ?? "";
      }
      if (typeof token.lastActivity === "number" && Number.isFinite(token.lastActivity)) {
        session.lastActivity = token.lastActivity;
      }
      return session;
    },
  },
});
