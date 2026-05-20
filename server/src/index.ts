import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma.js";
import type { FastifyRequest } from "fastify";

const app = Fastify({
  logger: true,
});

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  "dev-session-secret-change-in-production-min-32-chars-long!!";

await app.register(cookie);
await app.register(session, {
  secret: SESSION_SECRET,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // 內網 http 開發先 false；上 https 再改 true
    path: "/",
  },
  saveUninitialized: false,
});

app.get("/api/health", async () => ({ ok: true }));

function requireUser(req: FastifyRequest) {
  const u = req.session.user;
  if (!u) {
    const err = new Error("Unauthorized") as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  return u;
}

function getStatusCode(err: unknown): number | null {
  if (!err || (typeof err !== "object" && typeof err !== "function")) return null;
  const v = (err as { statusCode?: unknown }).statusCode;
  return typeof v === "number" ? v : null;
}

app.setErrorHandler((err, _req, reply) => {
  const status = getStatusCode(err) ?? 500;
  reply.code(status).send({ error: err.message || "Error" });
});

// Auth
app.post("/api/auth/login", async (req, reply) => {
  const schema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid body" });

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, name: true, role: true, passwordHash: true },
  });
  if (!user) return reply.code(401).send({ error: "帳號或密碼錯誤" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return reply.code(401).send({ error: "帳號或密碼錯誤" });

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
  return { ok: true, user: req.session.user };
});

app.post("/api/auth/logout", async (req) => {
  await req.session.destroy();
  return { ok: true };
});

app.get("/api/auth/me", async (req) => {
  return { user: req.session.user ?? null };
});

// Import logs (reuse existing ImportLog table)
app.get("/api/import/logs", async (req) => {
  requireUser(req);
  const rows = await prisma.importLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows;
});

// Daily shipped report
function parseYmd(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

app.get("/api/reports/daily-shipped", async (req) => {
  requireUser(req);
  const url = new URL(req.url, "http://localhost");
  const startUtc =
    parseYmd(url.searchParams.get("date")) ??
    (() => {
      const now = new Date();
      return parseYmd(toYmdLocal(now))!;
    })();
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

  const docs = await prisma.inspectionDoc.findMany({
    where: {
      status: "SHIPPED",
      OR: [
        { shippedAt: { gte: startUtc, lte: endUtc } },
        { AND: [{ shippedAt: null }, { updatedAt: { gte: startUtc, lte: endUtc } }] },
      ],
    },
    select: {
      id: true,
      documentType: true,
      documentNumber: true,
      logisticsNo: true,
      packageCount: true,
      departmentId: true,
      department: { select: { name: true } },
    },
    orderBy: [{ departmentId: "asc" }, { documentType: "asc" }, { documentNumber: "asc" }],
    take: 5000,
  });

  const sums =
    docs.length === 0
      ? []
      : await prisma.documentLine.groupBy({
          by: ["documentId"],
          where: { documentId: { in: docs.map((d) => d.id) } },
          _sum: { inspectQuantity: true },
        });
  const qtyByDocId = new Map(sums.map((s) => [s.documentId, s._sum.inspectQuantity ?? 0]));

  const byDepartment: Record<
    string,
    {
      departmentId: string;
      departmentName: string;
      rows: Array<{
        id: string;
        documentType: string;
        documentNumber: string;
        inspectTotal: number;
        logisticsNo: string | null;
        packageCount: number | null;
      }>;
    }
  > = {};

  for (const d of docs) {
    if (!byDepartment[d.departmentId]) {
      byDepartment[d.departmentId] = {
        departmentId: d.departmentId,
        departmentName: d.department.name,
        rows: [],
      };
    }
    byDepartment[d.departmentId].rows.push({
      id: d.id,
      documentType: d.documentType,
      documentNumber: d.documentNumber,
      inspectTotal: qtyByDocId.get(d.id) ?? 0,
      logisticsNo: d.logisticsNo ?? null,
      packageCount: d.packageCount ?? null,
    });
  }

  return {
    date: toYmdLocal(new Date(startUtc.getTime())),
    totalDocs: docs.length,
    byDepartment: Object.values(byDepartment).sort((a, b) =>
      a.departmentName.localeCompare(b.departmentName, "zh-Hant"),
    ),
  };
});

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";

await app.listen({ port, host });

