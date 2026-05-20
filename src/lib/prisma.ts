/**
 * Prisma 單例：開發與正式環境均掛在 globalThis，避免 Next 熱重載／多 bundle 重複建立連線。
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// 正式環境也要掛 global，避免 Next 打包／多模組載入時重複 new PrismaClient（連線打爆）
globalForPrisma.prisma = prisma;
