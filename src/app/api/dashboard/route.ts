/**
 * 儀表板統計資料
 * 對應 URL：/api/dashboard
 */

import { DocumentFlow, DocumentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import { parseDashboardDateRangeQuery } from "@/lib/dashboard-date-range";

type DashboardShippedByUserRow = {
  userId: string;
  username: string;
  name: string;
  byDepartment: { departmentId: string; name: string; count: number }[];
  total: number;
};
type DashboardCompletedByRoleRow = {
  roleType: "撿貨者" | "檢驗者" | "入庫者";
  userId: string;
  name: string;
  departmentId: string;
  departmentName: string;
  count: number;
};
type DashboardBrandQtyRow = {
  brand: string;
  byDepartment: { departmentId: string; name: string; quantity: number }[];
  total: number;
};

type DashboardOut = Awaited<ReturnType<typeof buildDashboard>>;

// ⚠️ In-memory cache：僅適用單進程部署（PM2 fork mode）。
// 若使用 PM2 cluster mode 或多實例，各 process cache 獨立，應改用 Redis。
const DASH_CACHE_TTL_MS = 30_000;
const dashCache = globalThis as unknown as {
  __dashCache?: Map<string, { exp: number; value: unknown }>;
};
dashCache.__dashCache ??= new Map();

function cacheGet<T>(key: string): T | null {
  const hit = dashCache.__dashCache?.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    dashCache.__dashCache?.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T) {
  dashCache.__dashCache?.set(key, { exp: Date.now() + DASH_CACHE_TTL_MS, value });
}

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "dashboard.view");
  if (f) return f;

  const { searchParams } = new URL(req.url);
  const parsed = parseDashboardDateRangeQuery(
    searchParams.get("from"),
    searchParams.get("to"),
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }
  const { start: rangeStart, end: rangeEnd } = parsed;
  const details = (searchParams.get("details") ?? "0") === "1";

  const cacheKey = JSON.stringify({
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
    details,
  });
  const cached = cacheGet<DashboardOut>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const dateFilter = {
    updatedAt: { gte: rangeStart, lte: rangeEnd },
  };

  const [
    pending,
    inspecting,
    completed,
    shipped,
    outPending,
    outInspecting,
    outCompleted,
    outShipped,
    inPending,
    inInspecting,
    inCompletedNotStocked,
    inStocked,
    deptRows,
    deptPackageRows,
    pickerDeptShipRows,
    inspectorDeptShipRows,
    stockerDeptStockedRows,
  ] = await Promise.all([
      prisma.inspectionDoc.count({
        where: { ...dateFilter, status: DocumentStatus.PENDING },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, status: DocumentStatus.INSPECTING },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, status: DocumentStatus.COMPLETED },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, status: DocumentStatus.SHIPPED },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, flow: DocumentFlow.OUT, status: DocumentStatus.PENDING },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, flow: DocumentFlow.OUT, status: DocumentStatus.INSPECTING },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, flow: DocumentFlow.OUT, status: DocumentStatus.COMPLETED },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, flow: DocumentFlow.OUT, status: DocumentStatus.SHIPPED },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, flow: DocumentFlow.IN, status: DocumentStatus.PENDING },
      }),
      prisma.inspectionDoc.count({
        where: { ...dateFilter, flow: DocumentFlow.IN, status: DocumentStatus.INSPECTING },
      }),
      prisma.inspectionDoc.count({
        where: {
          ...dateFilter,
          flow: DocumentFlow.IN,
          status: DocumentStatus.COMPLETED,
          stockedAt: null,
        },
      }),
      prisma.inspectionDoc.count({
        where: {
          ...dateFilter,
          flow: DocumentFlow.IN,
          status: DocumentStatus.COMPLETED,
          stockedAt: { not: null },
        },
      }),
      prisma.inspectionDoc.groupBy({
        by: ["departmentId", "flow", "status"],
        where: dateFilter,
        _count: true,
      }),
      prisma.inspectionDoc.groupBy({
        by: ["departmentId"],
        where: {
          ...dateFilter,
          status: DocumentStatus.SHIPPED,
          packageCount: { not: null },
        },
        _sum: { packageCount: true },
      }),
      // details=1 才需要的人員/品牌/物流明細；lite 模式直接回空陣列，避免 DB 壓力
      details
        ? prisma.inspectionDoc.groupBy({
            by: ["pickerId", "departmentId"],
            where: {
              ...dateFilter,
              pickerId: { not: null },
              // 驗出：揀貨者與出貨掛鉤（已出貨）。驗入無出貨狀態，改以「驗收完成」計入揀貨者，與檢驗者統計口徑一致。
              OR: [
                {
                  flow: DocumentFlow.OUT,
                  status: DocumentStatus.SHIPPED,
                },
                {
                  flow: DocumentFlow.IN,
                  status: DocumentStatus.COMPLETED,
                },
              ],
            },
            _count: true,
          })
        : Promise.resolve([]),
      details
        ? prisma.inspectionDoc.groupBy({
            by: ["inspectorId", "departmentId"],
            where: {
              ...dateFilter,
              inspectorId: { not: null },
              OR: [
                {
                  flow: DocumentFlow.OUT,
                  status: {
                    in: [DocumentStatus.COMPLETED, DocumentStatus.SHIPPED],
                  },
                },
                { flow: DocumentFlow.IN, status: DocumentStatus.COMPLETED },
              ],
            },
            _count: true,
          })
        : Promise.resolve([]),
      details
        ? prisma.inspectionDoc.groupBy({
            by: ["stockedById", "departmentId"],
            where: {
              ...dateFilter,
              flow: DocumentFlow.IN,
              status: DocumentStatus.COMPLETED,
              stockedAt: { not: null },
              stockedById: { not: null },
            },
            _count: true,
          })
        : Promise.resolve([]),
    ]);

  const departments = await prisma.department.findMany();
  const deptMap = Object.fromEntries(
    departments.map((d) => [d.id, d.name]),
  );

  const byDept: Record<
    string,
    {
      name: string;
      pending: number;
      inspecting: number;
      completed: number;
      shipped: number;
      shippedPackages: number;
    }
  > = {};
  const byDeptFlow: Record<
    string,
    {
      OUT: {
        name: string;
        pending: number;
        inspecting: number;
        completed: number;
        shipped: number;
        shippedPackages: number;
      };
      IN: {
        name: string;
        pending: number;
        inspecting: number;
        completed: number; // completed-but-not-stocked
        stocked: number;
      };
    }
  > = {};
  for (const d of departments) {
    byDept[d.id] = {
      name: d.name,
      pending: 0,
      inspecting: 0,
      completed: 0,
      shipped: 0,
      shippedPackages: 0,
    };
    byDeptFlow[d.id] = {
      OUT: {
        name: d.name,
        pending: 0,
        inspecting: 0,
        completed: 0,
        shipped: 0,
        shippedPackages: 0,
      },
      IN: {
        name: d.name,
        pending: 0,
        inspecting: 0,
        completed: 0,
        stocked: 0,
      },
    };
  }
  for (const r of deptRows) {
    const name = deptMap[r.departmentId];
    if (!byDept[r.departmentId]) {
      byDept[r.departmentId] = {
        name,
        pending: 0,
        inspecting: 0,
        completed: 0,
        shipped: 0,
        shippedPackages: 0,
      };
    }
    if (!byDeptFlow[r.departmentId]) {
      byDeptFlow[r.departmentId] = {
        OUT: {
          name,
          pending: 0,
          inspecting: 0,
          completed: 0,
          shipped: 0,
          shippedPackages: 0,
        },
        IN: { name, pending: 0, inspecting: 0, completed: 0, stocked: 0 },
      };
    }

    // 不分 flow 的總表（累加，避免不同 flow 覆寫）
    if (r.status === DocumentStatus.PENDING) byDept[r.departmentId].pending += r._count;
    if (r.status === DocumentStatus.INSPECTING) byDept[r.departmentId].inspecting += r._count;
    if (r.status === DocumentStatus.COMPLETED) byDept[r.departmentId].completed += r._count;
    if (r.status === DocumentStatus.SHIPPED) byDept[r.departmentId].shipped += r._count;

    // 依 flow 拆分（驗入最後一段會另外用 stockedAt 補）
    if (r.flow === DocumentFlow.OUT) {
      if (r.status === DocumentStatus.PENDING) byDeptFlow[r.departmentId].OUT.pending += r._count;
      if (r.status === DocumentStatus.INSPECTING) byDeptFlow[r.departmentId].OUT.inspecting += r._count;
      if (r.status === DocumentStatus.COMPLETED) byDeptFlow[r.departmentId].OUT.completed += r._count;
      if (r.status === DocumentStatus.SHIPPED) byDeptFlow[r.departmentId].OUT.shipped += r._count;
    }
    if (r.flow === DocumentFlow.IN) {
      if (r.status === DocumentStatus.PENDING) byDeptFlow[r.departmentId].IN.pending += r._count;
      if (r.status === DocumentStatus.INSPECTING) byDeptFlow[r.departmentId].IN.inspecting += r._count;
      if (r.status === DocumentStatus.COMPLETED) byDeptFlow[r.departmentId].IN.completed += r._count;
    }
  }

  for (const r of deptPackageRows) {
    const name = deptMap[r.departmentId];
    if (!byDept[r.departmentId]) {
      byDept[r.departmentId] = {
        name,
        pending: 0,
        inspecting: 0,
        completed: 0,
        shipped: 0,
        shippedPackages: 0,
      };
    }
    byDept[r.departmentId].shippedPackages = r._sum.packageCount ?? 0;
    if (byDeptFlow[r.departmentId]) {
      byDeptFlow[r.departmentId].OUT.shippedPackages = r._sum.packageCount ?? 0;
    }
  }

  // 驗入：已入庫（stockedAt != null）依部門補上，並從 completed 拆出
  const stockedByDept = await prisma.inspectionDoc.groupBy({
    by: ["departmentId"],
    where: {
      ...dateFilter,
      flow: DocumentFlow.IN,
      status: DocumentStatus.COMPLETED,
      stockedAt: { not: null },
    },
    _count: true,
  });
  for (const r of stockedByDept) {
    const name = deptMap[r.departmentId];
    if (!byDeptFlow[r.departmentId]) {
      byDeptFlow[r.departmentId] = {
        OUT: {
          name,
          pending: 0,
          inspecting: 0,
          completed: 0,
          shipped: 0,
          shippedPackages: 0,
        },
        IN: { name, pending: 0, inspecting: 0, completed: 0, stocked: 0 },
      };
    }
    byDeptFlow[r.departmentId].IN.stocked = r._count;
    byDeptFlow[r.departmentId].IN.completed = Math.max(
      0,
      byDeptFlow[r.departmentId].IN.completed - r._count,
    );
  }

  const deptIdsOrdered = departments.map((d) => d.id);

  // details=0：先回傳「空的明細區塊」避免前端掛掉
  let returnPieces = 0;
  let logisticsPackages = 0;
  let logisticsByDeptPackageSize = {
    rows: [
      { key: "A" as const, label: "A（小件）" },
      { key: "C" as const, label: "C（大件）" },
    ],
    byDepartment: deptIdsOrdered.map((deptId) => ({
      departmentId: deptId,
      name: deptMap[deptId] ?? "—",
      A: 0,
      C: 0,
      other: 0,
    })),
  };
  let logisticsByDeptPackageSizeByFlow = {
    OUT: {
      byDepartment: deptIdsOrdered.map((deptId) => ({
        departmentId: deptId,
        name: deptMap[deptId] ?? "—",
        A: 0,
        C: 0,
        other: 0,
      })),
    },
    IN: {
      byDepartment: deptIdsOrdered.map((deptId) => ({
        departmentId: deptId,
        name: deptMap[deptId] ?? "—",
        A: 0,
        C: 0,
        other: 0,
      })),
    },
  };
  let shippedByUser: DashboardShippedByUserRow[] = [];
  let completedByRole: DashboardCompletedByRoleRow[] = [];
  let shippedQtyByBrand: DashboardBrandQtyRow[] = [];
  let completedQtyByBrandByFlow: {
    OUT: DashboardBrandQtyRow[];
    IN: DashboardBrandQtyRow[];
  } = { OUT: [], IN: [] };

  /** userId -> departmentId -> shipped doc count */
  let userById: Record<string, { id: string; username: string; name: string | null }> = {};
  if (details) {
    // 物流/退貨 totals
    const [returnPiecesAgg, logisticsPackagesAgg] = await Promise.all([
      prisma.returnShipment.aggregate({
        where: {
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { pieceCount: true },
      }),
      prisma.inspectionDoc.aggregate({
        where: {
          ...dateFilter,
          status: DocumentStatus.SHIPPED,
          packageCount: { not: null },
        },
        _sum: { packageCount: true },
      }),
    ]);
    returnPieces = returnPiecesAgg._sum.pieceCount ?? 0;
    logisticsPackages = logisticsPackagesAgg._sum.packageCount ?? 0;

    // 物流 A/C 依部門與 flow（用 groupBy，成本遠低於抓明細）
    const [deptPackageACRows, deptPackageACOutRows, deptPackageACInRows] =
      await Promise.all([
        prisma.inspectionDoc.groupBy({
          by: ["departmentId"],
          where: {
            ...dateFilter,
            status: DocumentStatus.SHIPPED,
            OR: [{ packageCountA: { not: null } }, { packageCountC: { not: null } }],
          },
          _sum: { packageCountA: true, packageCountC: true },
        }),
        prisma.inspectionDoc.groupBy({
          by: ["departmentId"],
          where: {
            ...dateFilter,
            flow: DocumentFlow.OUT,
            status: DocumentStatus.SHIPPED,
            OR: [{ packageCountA: { not: null } }, { packageCountC: { not: null } }],
          },
          _sum: { packageCountA: true, packageCountC: true },
        }),
        prisma.inspectionDoc.groupBy({
          by: ["departmentId"],
          where: {
            ...dateFilter,
            flow: DocumentFlow.IN,
            status: DocumentStatus.COMPLETED,
            stockedAt: { not: null },
            OR: [{ packageCountA: { not: null } }, { packageCountC: { not: null } }],
          },
          _sum: { packageCountA: true, packageCountC: true },
        }),
      ]);

    const deptPackageSize: Record<string, { A: number; C: number; OTHER: number }> =
      {};
    for (const d of departments) {
      deptPackageSize[d.id] = { A: 0, C: 0, OTHER: 0 };
    }
    for (const r of deptPackageACRows) {
      const deptId = r.departmentId;
      if (!deptPackageSize[deptId])
        deptPackageSize[deptId] = { A: 0, C: 0, OTHER: 0 };
      deptPackageSize[deptId].A += r._sum.packageCountA ?? 0;
      deptPackageSize[deptId].C += r._sum.packageCountC ?? 0;
    }

    const deptPackageByFlow: Record<
      "OUT" | "IN",
      Record<string, { A: number; C: number; OTHER: number }>
    > = {
      OUT: {},
      IN: {},
    };
    for (const d of departments) {
      deptPackageByFlow.OUT[d.id] = { A: 0, C: 0, OTHER: 0 };
      deptPackageByFlow.IN[d.id] = { A: 0, C: 0, OTHER: 0 };
    }
    for (const r of deptPackageACOutRows) {
      const deptId = r.departmentId;
      if (!deptPackageByFlow.OUT[deptId])
        deptPackageByFlow.OUT[deptId] = { A: 0, C: 0, OTHER: 0 };
      deptPackageByFlow.OUT[deptId].A += r._sum.packageCountA ?? 0;
      deptPackageByFlow.OUT[deptId].C += r._sum.packageCountC ?? 0;
    }
    for (const r of deptPackageACInRows) {
      const deptId = r.departmentId;
      if (!deptPackageByFlow.IN[deptId])
        deptPackageByFlow.IN[deptId] = { A: 0, C: 0, OTHER: 0 };
      deptPackageByFlow.IN[deptId].A += r._sum.packageCountA ?? 0;
      deptPackageByFlow.IN[deptId].C += r._sum.packageCountC ?? 0;
    }

    // 舊資料 fallback：若只有 packageCount、但 A/C 皆為 null，算入 OTHER
    const legacyOtherRows = await prisma.inspectionDoc.groupBy({
      by: ["departmentId"],
      where: {
        ...dateFilter,
        status: DocumentStatus.SHIPPED,
        packageCount: { not: null },
        packageCountA: null,
        packageCountC: null,
      },
      _sum: { packageCount: true },
    });
    for (const r of legacyOtherRows) {
      const deptId = r.departmentId;
      if (!deptPackageSize[deptId])
        deptPackageSize[deptId] = { A: 0, C: 0, OTHER: 0 };
      deptPackageSize[deptId].OTHER += r._sum.packageCount ?? 0;
    }

    logisticsByDeptPackageSize = {
      rows: [
        { key: "A" as const, label: "A（小件）" },
        { key: "C" as const, label: "C（大件）" },
      ],
      byDepartment: deptIdsOrdered.map((deptId) => ({
        departmentId: deptId,
        name: deptMap[deptId] ?? "—",
        A: deptPackageSize[deptId]?.A ?? 0,
        C: deptPackageSize[deptId]?.C ?? 0,
        other: deptPackageSize[deptId]?.OTHER ?? 0,
      })),
    };
    logisticsByDeptPackageSizeByFlow = {
      OUT: {
        byDepartment: deptIdsOrdered.map((deptId) => ({
          departmentId: deptId,
          name: deptMap[deptId] ?? "—",
          A: deptPackageByFlow.OUT[deptId]?.A ?? 0,
          C: deptPackageByFlow.OUT[deptId]?.C ?? 0,
          other: deptPackageByFlow.OUT[deptId]?.OTHER ?? 0,
        })),
      },
      IN: {
        byDepartment: deptIdsOrdered.map((deptId) => ({
          departmentId: deptId,
          name: deptMap[deptId] ?? "—",
          A: deptPackageByFlow.IN[deptId]?.A ?? 0,
          C: deptPackageByFlow.IN[deptId]?.C ?? 0,
          other: deptPackageByFlow.IN[deptId]?.OTHER ?? 0,
        })),
      },
    };

    // 人員統計
    const shippedByUserDept: Record<string, Record<string, number>> = {};
    function addShip(userId: string, departmentId: string, n: number) {
      if (!shippedByUserDept[userId]) shippedByUserDept[userId] = {};
      const m = shippedByUserDept[userId];
      m[departmentId] = (m[departmentId] ?? 0) + n;
    }
    for (const r of pickerDeptShipRows) {
      if (r.pickerId) addShip(r.pickerId, r.departmentId, r._count);
    }
    for (const r of inspectorDeptShipRows) {
      if (r.inspectorId) addShip(r.inspectorId, r.departmentId, r._count);
    }
    for (const r of stockerDeptStockedRows) {
      if (r.stockedById) addShip(r.stockedById, r.departmentId, r._count);
    }
    const shipUserIds = Object.keys(shippedByUserDept);
    const shipUsers = await prisma.user.findMany({
      where: { id: { in: shipUserIds } },
      select: { id: true, username: true, name: true },
    });
    userById = Object.fromEntries(shipUsers.map((x) => [x.id, x]));

    shippedByUser = shipUserIds
      .map((userId) => {
        const perDept = shippedByUserDept[userId] ?? {};
        let total = 0;
        const byDepartment = deptIdsOrdered.map((deptId) => {
          const c = perDept[deptId] ?? 0;
          total += c;
          return {
            departmentId: deptId,
            name: deptMap[deptId] ?? "—",
            count: c,
          };
        });
        const u = userById[userId];
        return {
          userId,
          username: u?.username ?? "—",
          name: u?.name ?? "—",
          byDepartment,
          total,
        };
      })
      .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username));

    completedByRole = [
      ...pickerDeptShipRows
        .filter((r) => !!r.pickerId)
        .map((r) => ({
          roleType: "撿貨者" as const,
          userId: r.pickerId as string,
          name: userById[r.pickerId as string]?.name ?? "—",
          departmentId: r.departmentId,
          departmentName: deptMap[r.departmentId] ?? "—",
          count: r._count,
        })),
      ...inspectorDeptShipRows
        .filter((r) => !!r.inspectorId)
        .map((r) => ({
          roleType: "檢驗者" as const,
          userId: r.inspectorId as string,
          name: userById[r.inspectorId as string]?.name ?? "—",
          departmentId: r.departmentId,
          departmentName: deptMap[r.departmentId] ?? "—",
          count: r._count,
        })),
      ...stockerDeptStockedRows
        .filter((r) => !!r.stockedById)
        .map((r) => ({
          roleType: "入庫者" as const,
          userId: r.stockedById as string,
          name: userById[r.stockedById as string]?.name ?? "—",
          departmentId: r.departmentId,
          departmentName: deptMap[r.departmentId] ?? "—",
          count: r._count,
        })),
    ].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.roleType !== b.roleType) return a.roleType.localeCompare(b.roleType);
      return a.name.localeCompare(b.name);
    });

    // 品牌統計：最重（會掃大量明細），加硬上限避免把 Node 記憶體打爆
    const MAX_LINES = 200_000;
    const [outLineCount, inLineCount] = await Promise.all([
      prisma.documentLine.count({
        where: {
          document: {
            ...dateFilter,
            flow: DocumentFlow.OUT,
            status: DocumentStatus.SHIPPED,
          },
        },
      }),
      prisma.documentLine.count({
        where: {
          document: {
            ...dateFilter,
            flow: DocumentFlow.IN,
            status: DocumentStatus.COMPLETED,
            stockedAt: { not: null },
          },
        },
      }),
    ]);

    if (outLineCount + inLineCount <= MAX_LINES) {
      const [outShippedLines, inStockedLines] = await Promise.all([
        prisma.documentLine.findMany({
          where: {
            document: {
              ...dateFilter,
              flow: DocumentFlow.OUT,
              status: DocumentStatus.SHIPPED,
            },
          },
          select: {
            productCode: true,
            inspectQuantity: true,
            document: { select: { departmentId: true } },
          },
        }),
        prisma.documentLine.findMany({
          where: {
            document: {
              ...dateFilter,
              flow: DocumentFlow.IN,
              status: DocumentStatus.COMPLETED,
              stockedAt: { not: null },
            },
          },
          select: {
            productCode: true,
            inspectQuantity: true,
            document: { select: { departmentId: true } },
          },
        }),
      ]);

      const outProductCodes = [...new Set(outShippedLines.map((l) => l.productCode))];
      const inProductCodes = [...new Set(inStockedLines.map((l) => l.productCode))];
      const productCodes = [...new Set([...outProductCodes, ...inProductCodes])];
      const products =
        productCodes.length === 0
          ? []
          : await prisma.product.findMany({
              where: { productCode: { in: productCodes } },
              select: { productCode: true, brand: true },
            });
      const brandByProductCode = Object.fromEntries(
        products.map((p) => [p.productCode, p.brand]),
      );

      type BrandAgg = Record<string, Record<string, number>>;
      function normalizeBrand(raw: unknown): string {
        const s = raw != null ? String(raw).trim() : "";
        return s ? s : "未設定品牌";
      }
      function buildBrandAgg(lines: typeof outShippedLines): BrandAgg {
        const brandDeptQty: BrandAgg = {};
        for (const ln of lines) {
          const label = normalizeBrand(brandByProductCode[ln.productCode]);
          const deptId = ln.document.departmentId;
          if (!brandDeptQty[label]) brandDeptQty[label] = {};
          const m = brandDeptQty[label];
          m[deptId] = (m[deptId] ?? 0) + ln.inspectQuantity;
        }
        return brandDeptQty;
      }
      function toBrandRows(brandDeptQty: BrandAgg) {
        return Object.entries(brandDeptQty)
          .map(([brand, perDept]) => {
            let total = 0;
            const byDepartment = deptIdsOrdered.map((deptId) => {
              const q = perDept[deptId] ?? 0;
              total += q;
              return {
                departmentId: deptId,
                name: deptMap[deptId] ?? "—",
                quantity: q,
              };
            });
            return { brand, byDepartment, total };
          })
          .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));
      }

      shippedQtyByBrand = toBrandRows(buildBrandAgg(outShippedLines));
      const inStockedQtyByBrand = toBrandRows(buildBrandAgg(inStockedLines));
      completedQtyByBrandByFlow = {
        OUT: shippedQtyByBrand,
        IN: inStockedQtyByBrand,
      };
    } else {
      // 超過上限就直接跳過品牌統計（避免壓爆）
      shippedQtyByBrand = [];
      completedQtyByBrandByFlow = { OUT: [], IN: [] };
    }
  }

  const out = buildDashboard({
    totals: {
      pending,
      inspecting,
      completed,
      shipped,
      logisticsPackages,
      returnPieces,
    },
    totalsByFlow: {
      OUT: {
        pending: outPending,
        inspecting: outInspecting,
        completed: outCompleted,
        shipped: outShipped,
      },
      IN: {
        pending: inPending,
        inspecting: inInspecting,
        completed: inCompletedNotStocked,
        stocked: inStocked,
      },
    },
    byDepartment: Object.entries(byDept).map(([id, row]) => ({ id, ...row })),
    byDepartmentByFlow: {
      OUT: deptIdsOrdered.map((id) => ({
        id,
        ...byDeptFlow[id]?.OUT,
      })),
      IN: deptIdsOrdered.map((id) => ({
        id,
        ...byDeptFlow[id]?.IN,
      })),
    },
    logisticsByDeptPackageSize,
    logisticsByDeptPackageSizeByFlow,
    shippedByUser,
    completedByRole,
    shippedQtyByBrand,
    completedQtyByBrandByFlow,
  });

  cacheSet(cacheKey, out);
  return NextResponse.json(out);
}

function buildDashboard<T extends object>(v: T) {
  return v;
}
