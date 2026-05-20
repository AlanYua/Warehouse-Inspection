/**
 * (client) Dashboard 資料載入與圖表
 * 檔案：src/app/(shell)/dashboard-client.tsx
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { localCalendarYmd } from "@/lib/dashboard-date-range";
import type { Dash } from "./dashboard-types";

export default function DashboardClient() {
  const today = localCalendarYmd();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [detailsLoaded, setDetailsLoaded] = useState(false);

  const load = useCallback(async (details: boolean) => {
    setErr(null);
    const q = new URLSearchParams({
      from: dateFrom,
      to: dateTo,
      details: details ? "1" : "0",
    });
    const res = await fetch(`/api/dashboard?${q}`, { credentials: "include" });
    if (!res.ok) {
      const t = await res.text();
      setErr(t || res.statusText);
      return;
    }
    setD(await res.json());
    setDetailsLoaded(details);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load(false);
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  if (err) {
    return <p className="text-destructive text-sm">無法載入：{err}</p>;
  }
  if (!d) return <p className="text-muted-foreground">載入中…</p>;

  const deptTableTotals = d.byDepartmentByFlow.OUT.reduce(
    (acc, r) => ({
      pending: acc.pending + r.pending,
      inspecting: acc.inspecting + r.inspecting,
      completed: acc.completed + r.completed,
      shipped: acc.shipped + r.shipped,
      shippedPackages: acc.shippedPackages + (r.shippedPackages ?? 0),
    }),
    { pending: 0, inspecting: 0, completed: 0, shipped: 0, shippedPackages: 0 },
  );

  const brandsOutCompleted = d.completedQtyByBrandByFlow?.OUT ?? [];
  const brandsInCompleted = d.completedQtyByBrandByFlow?.IN ?? [];
  const brandDeptTotalsOutCompleted = d.byDepartment.map((dept) =>
    brandsOutCompleted.reduce((sum, row) => {
      const cell = row.byDepartment.find((c) => c.departmentId === dept.id);
      return sum + (cell?.quantity ?? 0);
    }, 0),
  );
  const brandGrandTotalOutCompleted = brandsOutCompleted.reduce((s, row) => s + row.total, 0);
  const brandDeptTotalsInCompleted = d.byDepartment.map((dept) =>
    brandsInCompleted.reduce((sum, row) => {
      const cell = row.byDepartment.find((c) => c.departmentId === dept.id);
      return sum + (cell?.quantity ?? 0);
    }, 0),
  );
  const brandGrandTotalInCompleted = brandsInCompleted.reduce((s, row) => s + row.total, 0);

  const completedByRoleDeptIds = d.byDepartment.map((dept) => dept.id);
  const completedByRolePivot = Array.from(
    d.completedByRole
      .reduce<
        Map<
          string,
          {
            key: string;
            roleType: "撿貨者" | "檢驗者" | "入庫者";
            userId: string;
            name: string;
            byDepartment: Record<string, number>;
            total: number;
          }
        >
      >((acc, row) => {
        const rowKey = `${row.roleType}-${row.userId}`;
        const existing = acc.get(rowKey);
        if (!existing) {
          const byDepartment: Record<string, number> = {};
          for (const deptId of completedByRoleDeptIds) byDepartment[deptId] = 0;
          byDepartment[row.departmentId] = row.count;
          acc.set(rowKey, {
            key: rowKey,
            roleType: row.roleType,
            userId: row.userId,
            name: row.name,
            byDepartment,
            total: row.count,
          });
          return acc;
        }
        existing.byDepartment[row.departmentId] =
          (existing.byDepartment[row.departmentId] ?? 0) + row.count;
        existing.total += row.count;
        return acc;
      }, new Map())
      .values(),
  ).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (a.roleType !== b.roleType) return a.roleType.localeCompare(b.roleType);
    return a.name.localeCompare(b.name);
  });
  const completedByRolePivotTotal = completedByRolePivot.reduce(
    (sum, row) => sum + row.total,
    0,
  );

  const pkg = d.logisticsByDeptPackageSize;
  const pkgDeptOrdered = d.byDepartment.map((x) => x.id);
  const pkgByDeptMap = new Map(pkg.byDepartment.map((x) => [x.departmentId, x]));
  const pkgAByDept = pkgDeptOrdered.map((deptId) => pkgByDeptMap.get(deptId)?.A ?? 0);
  const pkgCByDept = pkgDeptOrdered.map((deptId) => pkgByDeptMap.get(deptId)?.C ?? 0);
  const pkgOtherByDept = pkgDeptOrdered.map(
    (deptId) => pkgByDeptMap.get(deptId)?.other ?? 0,
  );
  const pkgFlow = d.logisticsByDeptPackageSizeByFlow;
  const pkgOutByDeptMap = new Map(
    pkgFlow.OUT.byDepartment.map((x) => [x.departmentId, x]),
  );
  const pkgInByDeptMap = new Map(
    pkgFlow.IN.byDepartment.map((x) => [x.departmentId, x]),
  );
  const outAByDept = pkgDeptOrdered.map((deptId) => pkgOutByDeptMap.get(deptId)?.A ?? 0);
  const outCByDept = pkgDeptOrdered.map((deptId) => pkgOutByDeptMap.get(deptId)?.C ?? 0);
  const inAByDept = pkgDeptOrdered.map((deptId) => pkgInByDeptMap.get(deptId)?.A ?? 0);
  const inCByDept = pkgDeptOrdered.map((deptId) => pkgInByDeptMap.get(deptId)?.C ?? 0);
  const outATotal = outAByDept.reduce((a, b) => a + b, 0);
  const outCTotal = outCByDept.reduce((a, b) => a + b, 0);
  const inATotal = inAByDept.reduce((a, b) => a + b, 0);
  const inCTotal = inCByDept.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground block">開始日</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground block">結束日</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="button"
          className="text-sm px-3 py-1.5 rounded-md border border-border bg-background shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => {
            const t = localCalendarYmd();
            setDateFrom(t);
            setDateTo(t);
          }}
        >
          今天
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 border-b border-border">
            <div>
              <div className="text-lg font-semibold text-foreground">出貨</div>
            </div>
            <div className="text-xs text-muted-foreground text-right sm:shrink-0">
              <div>狀態分佈</div>
              <div className="tabular-nums">
                {d.totalsByFlow.OUT.pending +
                  d.totalsByFlow.OUT.inspecting +
                  d.totalsByFlow.OUT.completed +
                  d.totalsByFlow.OUT.shipped}
                {" "}
                筆
              </div>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="未完成" value={d.totalsByFlow.OUT.pending} />
              <Stat label="驗收中" value={d.totalsByFlow.OUT.inspecting} />
              <Stat label="已完成" value={d.totalsByFlow.OUT.completed} />
              <Stat label="已出貨" value={d.totalsByFlow.OUT.shipped} />
            </div>
            {/* Mobile: dept cards */}
            <div className="md:hidden space-y-2">
              {d.byDepartmentByFlow.OUT.map((r) => {
                const total = r.pending + r.inspecting + r.completed + r.shipped;
                if (total === 0 && !(r.shippedPackages > 0)) return null;
                return (
                  <div key={r.id} className="rounded-lg border border-border/80 bg-background/40 p-2.5 text-sm">
                    <div className="font-medium mb-1">{r.name}</div>
                    <div className="grid grid-cols-5 gap-1 text-xs">
                      <div className="text-center"><div className="text-muted-foreground">未完成</div><div className="tabular-nums font-medium">{r.pending}</div></div>
                      <div className="text-center"><div className="text-muted-foreground">驗收中</div><div className="tabular-nums font-medium">{r.inspecting}</div></div>
                      <div className="text-center"><div className="text-muted-foreground">已完成</div><div className="tabular-nums font-medium">{r.completed}</div></div>
                      <div className="text-center"><div className="text-muted-foreground">已出貨</div><div className="tabular-nums font-medium">{r.shipped}</div></div>
                      <div className="text-center"><div className="text-muted-foreground">件數</div><div className="tabular-nums font-medium">{r.shippedPackages > 0 ? r.shippedPackages : "—"}</div></div>
                    </div>
                  </div>
                );
              })}
              <div className="rounded-lg border-2 border-border bg-muted/60 p-2.5 text-sm font-medium">
                <div className="mb-1">合計</div>
                <div className="grid grid-cols-5 gap-1 text-xs">
                  <div className="text-center"><div className="text-muted-foreground">未完成</div><div className="tabular-nums">{d.totalsByFlow.OUT.pending}</div></div>
                  <div className="text-center"><div className="text-muted-foreground">驗收中</div><div className="tabular-nums">{d.totalsByFlow.OUT.inspecting}</div></div>
                  <div className="text-center"><div className="text-muted-foreground">已完成</div><div className="tabular-nums">{d.totalsByFlow.OUT.completed}</div></div>
                  <div className="text-center"><div className="text-muted-foreground">已出貨</div><div className="tabular-nums">{d.totalsByFlow.OUT.shipped}</div></div>
                  <div className="text-center"><div className="text-muted-foreground">件數</div><div className="tabular-nums">{deptTableTotals.shippedPackages > 0 ? deptTableTotals.shippedPackages : "—"}</div></div>
                </div>
              </div>
            </div>
            {/* Desktop: dept table */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border/80 bg-background/40">
              <table className="min-w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">部門</th>
                    <th className="text-right p-2">未完成</th>
                    <th className="text-right p-2">驗收中</th>
                    <th className="text-right p-2">已完成</th>
                    <th className="text-right p-2">已出貨</th>
                    <th className="text-right p-2">件數</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byDepartmentByFlow.OUT.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-right tabular-nums">{r.pending}</td>
                      <td className="p-2 text-right tabular-nums">{r.inspecting}</td>
                      <td className="p-2 text-right tabular-nums">{r.completed}</td>
                      <td className="p-2 text-right tabular-nums">{r.shipped}</td>
                      <td className="p-2 text-right tabular-nums">
                        {r.shippedPackages > 0 ? r.shippedPackages : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/60 border-t-2 border-border font-medium text-foreground">
                  <tr>
                    <td className="p-2">合計</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.OUT.pending}</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.OUT.inspecting}</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.OUT.completed}</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.OUT.shipped}</td>
                    <td className="p-2 text-right tabular-nums">
                      {deptTableTotals.shippedPackages > 0 ? deptTableTotals.shippedPackages : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 border-b border-border">
            <div>
              <div className="text-lg font-semibold text-foreground">進貨/退貨</div>
            </div>
            <div className="text-xs text-muted-foreground text-right sm:shrink-0">
              <div>狀態分佈</div>
              <div className="tabular-nums">
                {d.totalsByFlow.IN.pending +
                  d.totalsByFlow.IN.inspecting +
                  d.totalsByFlow.IN.completed +
                  d.totalsByFlow.IN.stocked}
                {" "}
                筆
              </div>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="未完成" value={d.totalsByFlow.IN.pending} />
              <Stat label="驗收中" value={d.totalsByFlow.IN.inspecting} />
              <Stat label="已完成" value={d.totalsByFlow.IN.completed} />
              <Stat label="已入庫" value={d.totalsByFlow.IN.stocked} />
            </div>
            {/* Mobile: dept cards */}
            <div className="md:hidden space-y-2">
              {d.byDepartmentByFlow.IN.map((r) => {
                const total = r.pending + r.inspecting + r.completed + r.stocked;
                if (total === 0) return null;
                return (
                  <div key={r.id} className="rounded-lg border border-border/80 bg-background/40 p-2.5 text-sm">
                    <div className="font-medium mb-1">{r.name}</div>
                    <div className="grid grid-cols-4 gap-1 text-xs">
                      <div className="text-center"><div className="text-muted-foreground">未完成</div><div className="tabular-nums font-medium">{r.pending}</div></div>
                      <div className="text-center"><div className="text-muted-foreground">驗收中</div><div className="tabular-nums font-medium">{r.inspecting}</div></div>
                      <div className="text-center"><div className="text-muted-foreground">已完成</div><div className="tabular-nums font-medium">{r.completed}</div></div>
                      <div className="text-center"><div className="text-muted-foreground">已入庫</div><div className="tabular-nums font-medium">{r.stocked}</div></div>
                    </div>
                  </div>
                );
              })}
              <div className="rounded-lg border-2 border-border bg-muted/60 p-2.5 text-sm font-medium">
                <div className="mb-1">合計</div>
                <div className="grid grid-cols-4 gap-1 text-xs">
                  <div className="text-center"><div className="text-muted-foreground">未完成</div><div className="tabular-nums">{d.totalsByFlow.IN.pending}</div></div>
                  <div className="text-center"><div className="text-muted-foreground">驗收中</div><div className="tabular-nums">{d.totalsByFlow.IN.inspecting}</div></div>
                  <div className="text-center"><div className="text-muted-foreground">已完成</div><div className="tabular-nums">{d.totalsByFlow.IN.completed}</div></div>
                  <div className="text-center"><div className="text-muted-foreground">已入庫</div><div className="tabular-nums">{d.totalsByFlow.IN.stocked}</div></div>
                </div>
              </div>
            </div>
            {/* Desktop: dept table */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border/80 bg-background/40">
              <table className="min-w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">部門</th>
                    <th className="text-right p-2">未完成</th>
                    <th className="text-right p-2">驗收中</th>
                    <th className="text-right p-2">已完成</th>
                    <th className="text-right p-2">已入庫</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byDepartmentByFlow.IN.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-right tabular-nums">{r.pending}</td>
                      <td className="p-2 text-right tabular-nums">{r.inspecting}</td>
                      <td className="p-2 text-right tabular-nums">{r.completed}</td>
                      <td className="p-2 text-right tabular-nums">{r.stocked}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/60 border-t-2 border-border font-medium text-foreground">
                  <tr>
                    <td className="p-2">合計</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.IN.pending}</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.IN.inspecting}</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.IN.completed}</td>
                    <td className="p-2 text-right tabular-nums">{d.totalsByFlow.IN.stocked}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      </div>

      <details
        className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden"
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          if (open && !detailsLoaded) void load(true);
        }}
      >
        <summary className="cursor-pointer select-none list-none p-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 pr-2">
            <div className="text-sm text-muted-foreground">其他統計</div>
            <div className="text-base font-semibold text-foreground">
              物流 / 退貨 / 品牌 / 人員
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:max-w-md sm:shrink-0 sm:justify-end">
            <Stat label="物流件數" value={d.totals.logisticsPackages} />
            <Stat label="退貨件數" value={d.totals.returnPieces} />
          </div>
        </summary>
        <div className="p-4 pt-0 space-y-6">
      <div>
        <h2 className="font-medium text-foreground mb-2">
          物流件數（依部門）
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">類別</th>
                {d.byDepartment.map((dept) => (
                  <th
                    key={dept.id}
                    className="text-right p-2 whitespace-nowrap min-w-[4.5rem]"
                  >
                    {dept.name}
                  </th>
                ))}
                <th className="text-right p-2 whitespace-nowrap font-medium">
                  合計
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="p-2 whitespace-nowrap">出貨 A（小件）</td>
                {outAByDept.map((v, i) => (
                  <td
                    key={d.byDepartment[i]?.id ?? i}
                    className="p-2 text-right tabular-nums"
                  >
                    {v > 0 ? v : "—"}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums font-medium">
                  {outATotal}
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="p-2 whitespace-nowrap">出貨 C（大件）</td>
                {outCByDept.map((v, i) => (
                  <td
                    key={d.byDepartment[i]?.id ?? i}
                    className="p-2 text-right tabular-nums"
                  >
                    {v > 0 ? v : "—"}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums font-medium">
                  {outCTotal}
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="p-2 whitespace-nowrap">進貨/退貨 A（小件）</td>
                {inAByDept.map((v, i) => (
                  <td
                    key={d.byDepartment[i]?.id ?? i}
                    className="p-2 text-right tabular-nums"
                  >
                    {v > 0 ? v : "—"}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums font-medium">
                  {inATotal}
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="p-2 whitespace-nowrap">進貨/退貨 C（大件）</td>
                {inCByDept.map((v, i) => (
                  <td
                    key={d.byDepartment[i]?.id ?? i}
                    className="p-2 text-right tabular-nums"
                  >
                    {v > 0 ? v : "—"}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums font-medium">
                  {inCTotal}
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-muted/60 border-t-2 border-border font-medium text-foreground">
              <tr>
                <td className="p-2 whitespace-nowrap">合計</td>
                {pkgDeptOrdered.map((deptId, i) => {
                  const outA = pkgOutByDeptMap.get(deptId)?.A ?? 0;
                  const outC = pkgOutByDeptMap.get(deptId)?.C ?? 0;
                  const inA = pkgInByDeptMap.get(deptId)?.A ?? 0;
                  const inC = pkgInByDeptMap.get(deptId)?.C ?? 0;
                  const sum = outA + outC + inA + inC;
                  return (
                    <td
                      key={d.byDepartment[i]?.id ?? i}
                      className="p-2 text-right tabular-nums"
                    >
                      {sum > 0 ? sum : "—"}
                    </td>
                  );
                })}
                <td className="p-2 text-right tabular-nums">
                  {outATotal + outCTotal + inATotal + inCTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="space-y-6">
        <div>
          <h2 className="font-medium text-foreground mb-2">
            各品牌數量
          </h2>
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground mb-2">出貨（已出貨）</h3>
          <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left p-2 whitespace-nowrap">品牌</th>
                  {d.byDepartment.map((dept) => (
                    <th
                      key={dept.id}
                      className="text-right p-2 whitespace-nowrap min-w-[4.5rem]"
                    >
                      {dept.name}
                    </th>
                  ))}
                  <th className="text-right p-2 whitespace-nowrap font-medium">
                    合計
                  </th>
                </tr>
              </thead>
              <tbody>
                {brandsOutCompleted.length === 0 ? (
                  <tr className="border-t border-border">
                    <td
                      colSpan={d.byDepartment.length + 2}
                      className="p-3 text-muted-foreground"
                    >
                      尚無已出貨明細可統計
                    </td>
                  </tr>
                ) : (
                  brandsOutCompleted.map((row) => (
                    <tr key={row.brand} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">{row.brand}</td>
                      {row.byDepartment.map((cell) => (
                        <td
                          key={cell.departmentId}
                          className="p-2 text-right tabular-nums"
                        >
                          {cell.quantity > 0 ? cell.quantity : "—"}
                        </td>
                      ))}
                      <td className="p-2 text-right tabular-nums font-medium">
                        {row.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-muted/60 border-t-2 border-border font-medium text-foreground">
                <tr>
                  <td className="p-2 whitespace-nowrap">合計</td>
                  {brandDeptTotalsOutCompleted.map((qty, i) => (
                    <td
                      key={d.byDepartment[i]?.id ?? i}
                      className="p-2 text-right tabular-nums"
                    >
                      {qty > 0 ? qty : "—"}
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums">
                    {brandGrandTotalOutCompleted}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground mb-2">進貨/退貨（已入庫）</h3>
          <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left p-2 whitespace-nowrap">品牌</th>
                  {d.byDepartment.map((dept) => (
                    <th
                      key={dept.id}
                      className="text-right p-2 whitespace-nowrap min-w-[4.5rem]"
                    >
                      {dept.name}
                    </th>
                  ))}
                  <th className="text-right p-2 whitespace-nowrap font-medium">
                    合計
                  </th>
                </tr>
              </thead>
              <tbody>
                {brandsInCompleted.length === 0 ? (
                  <tr className="border-t border-border">
                    <td
                      colSpan={d.byDepartment.length + 2}
                      className="p-3 text-muted-foreground"
                    >
                      尚無已入庫明細可統計
                    </td>
                  </tr>
                ) : (
                  brandsInCompleted.map((row) => (
                    <tr key={row.brand} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">{row.brand}</td>
                      {row.byDepartment.map((cell) => (
                        <td
                          key={cell.departmentId}
                          className="p-2 text-right tabular-nums"
                        >
                          {cell.quantity > 0 ? cell.quantity : "—"}
                        </td>
                      ))}
                      <td className="p-2 text-right tabular-nums font-medium">
                        {row.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-muted/60 border-t-2 border-border font-medium text-foreground">
                <tr>
                  <td className="p-2 whitespace-nowrap">合計</td>
                  {brandDeptTotalsInCompleted.map((qty, i) => (
                    <td
                      key={d.byDepartment[i]?.id ?? i}
                      className="p-2 text-right tabular-nums"
                    >
                      {qty > 0 ? qty : "—"}
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums">
                    {brandGrandTotalInCompleted}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      <div>
        <h2 className="font-medium text-foreground mb-2">人員當日完成單據數</h2>
        <p className="text-xs text-muted-foreground mb-2">
          依目前日期區間統計揀貨/核對/入庫人員在各部門完成單數。
        </p>
        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">類型 + 姓名</th>
                {d.byDepartment.map((dept) => (
                  <th
                    key={dept.id}
                    className="text-right p-2 whitespace-nowrap min-w-[4.5rem]"
                  >
                    {dept.name}
                  </th>
                ))}
                <th className="text-right p-2 whitespace-nowrap font-medium">合計</th>
              </tr>
            </thead>
            <tbody>
              {completedByRolePivot.length === 0 ? (
                <tr className="border-t border-border">
                  <td
                    colSpan={d.byDepartment.length + 2}
                    className="p-3 text-muted-foreground"
                  >
                    尚無完工紀錄
                  </td>
                </tr>
              ) : (
                completedByRolePivot.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">
                      {row.name}
                      (
                      {row.roleType === "檢驗者"
                        ? "核對"
                        : row.roleType === "入庫者"
                          ? "入庫"
                          : row.roleType}
                      )
                    </td>
                    {completedByRoleDeptIds.map((deptId) => {
                      const count = row.byDepartment[deptId] ?? 0;
                      return (
                        <td
                          key={`${row.key}-${deptId}`}
                          className="p-2 text-right tabular-nums"
                        >
                          {count > 0 ? count : "—"}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right tabular-nums font-medium">
                      {row.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-muted/60 border-t-2 border-border font-medium text-foreground">
              <tr>
                <td className="p-2" colSpan={1 + d.byDepartment.length}>
                  合計
                </td>
                <td className="p-2 text-right tabular-nums">
                  {completedByRolePivotTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
          <button
        type="button"
        className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => void load(true)}
          >
            重新整理
          </button>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground p-3 shadow-xs">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
