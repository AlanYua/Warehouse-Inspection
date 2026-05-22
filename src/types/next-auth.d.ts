/**
 * 擴充 next-auth 的 Session／JWT 型別，讓 TypeScript 認得 user.id、role、username。
 */
import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: Role;
      username: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    username: string;
    lastActivity?: number;
    expired?: boolean;
  }
}
