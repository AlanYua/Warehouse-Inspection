/**
 * 日報表：當天出貨已出貨 / 進貨/退貨已入庫
 */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ShippedRow = {
  id: string;
  documentType: string;
  documentNumber: string;
  counterpartyName: string | null;
  inspectTotal: number;
  logisticsNo: string | null;
  packageCount: number | null;
};

type ShippedDept = {
  departmentId: string;
  departmentName: string;
  rows: ShippedRow[];
};

type ShippedPayload = {
  date: string;
  totalDocs: number;
  byDepartment: ShippedDept[];
};

type StockedRow = {
  id: string;
  documentType: string;
  documentNumber: string;
  counterpartyName: string | null;
  inspectTotal: number;
  packageCount: number | null;
};

type StockedDept = {
  departmentId: string;
  departmentName: string;
  rows: StockedRow[];
};

type StockedPayload = {
  date: string;
  totalDocs: number;
  byDepartment: StockedDept[];
};

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DailyReportPage() {
  const [date, setDate] = useState(todayYmdLocal());
  const [shipped, setShipped] = useState<ShippedPayload | null>(null);
  const [stocked, setStocked] = useState<StockedPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [sRes, iRes] = await Promise.all([
          fetch(`/api/reports/daily-shipped?date=${encodeURIComponent(date)}`, {
            credentials: "include",
          }),
          fetch(`/api/reports/daily-stocked?date=${encodeURIComponent(date)}`, {
            credentials: "include",
          }),
        ]);
        if (!sRes.ok || !iRes.ok) {
          const sText = sRes.ok ? "" : await sRes.text();
          const iText = iRes.ok ? "" : await iRes.text();
          setErr(
            [
              !sRes.ok ? `已出貨：${sText || `HTTP ${sRes.status}`}` : null,
              !iRes.ok ? `已入庫：${iText || `HTTP ${iRes.status}`}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          );
          setShipped(sRes.ok ? ((await sRes.json()) as ShippedPayload) : null);
          setStocked(iRes.ok ? ((await iRes.json()) as StockedPayload) : null);
          return;
        }
        setShipped((await sRes.json()) as ShippedPayload);
        setStocked((await iRes.json()) as StockedPayload);
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  const shippedInspectTotal = useMemo(() => {
    if (!shipped) return 0;
    let sum = 0;
    for (const d of shipped.byDepartment) {
      for (const r of d.rows) sum += r.inspectTotal;
    }
    return sum;
  }, [shipped]);

  const stockedInspectTotal = useMemo(() => {
    if (!stocked) return 0;
    let sum = 0;
    for (const d of stocked.byDepartment) {
      for (const r of d.rows) sum += r.inspectTotal;
    }
    return sum;
  }, [stocked]);

  return (
    <div className="page">
      <header className="page-header space-y-1">
        <h1 className="page-title">日報表</h1>
        <p className="page-desc hidden sm:block">
          出貨：當天已出貨單據（類型 / 單據號碼 / 名稱 / 檢驗總數 / 物流 / 件數）
        </p>
        <p className="page-desc hidden sm:block">
          進貨/退貨：當天已入庫單據（類型 / 名稱 / 單據號碼 / 檢驗總數 / 件數）
        </p>
      </header>
        <div className="filter-bar">
          <div className="field">
            <label className="field-label">日期</label>
            <input
              type="date"
              className="ui-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const url = `/api/reports/daily-shipped/excel?date=${encodeURIComponent(date)}`;
              window.location.assign(url);
            }}
          >
            <span className="hidden sm:inline">下載 EXCEL（已出貨）</span>
            <span className="sm:hidden">出貨 Excel</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const url = `/api/reports/daily-stocked/excel?date=${encodeURIComponent(date)}`;
              window.location.assign(url);
            }}
          >
            <span className="hidden sm:inline">下載 EXCEL（已入庫）</span>
            <span className="sm:hidden">入庫 Excel</span>
          </button>
        </div>

      {err && (
        <pre className="text-xs bg-muted text-muted-foreground p-2 rounded-md overflow-auto border border-border">
          {err}
        </pre>
      )}

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>出貨已出貨單據數：{shipped?.totalDocs ?? (loading ? "…" : 0)}</span>
        <span>出貨檢驗總數合計：{loading ? "…" : shippedInspectTotal}</span>
        <span>進貨/退貨已入庫單據數：{stocked?.totalDocs ?? (loading ? "…" : 0)}</span>
        <span>進貨/退貨檢驗總數合計：{loading ? "…" : stockedInspectTotal}</span>
      </div>

      <div className="space-y-10">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">出貨（已出貨）</h2>
            <div className="text-xs text-muted-foreground">
              單據數：{shipped?.totalDocs ?? (loading ? "…" : 0)}
            </div>
          </div>
          {!shipped ? (
            <p className="text-muted-foreground">{loading ? "載入中…" : "無資料"}</p>
          ) : (
            <div className="space-y-8">
              {shipped.byDepartment.map((dept) => (
                <section key={dept.departmentId} className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">
                      {dept.departmentName}
                    </h3>
                    <div className="text-xs text-muted-foreground">
                      筆數：{dept.rows.length}
                    </div>
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2">
                    {dept.rows.map((r) => (
                      <div key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/documents/${r.id}`}
                            className="font-mono text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                          >
                            {r.documentNumber}
                          </Link>
                          <span className="text-xs text-muted-foreground shrink-0">{r.documentType}</span>
                        </div>
                        {r.counterpartyName && (
                          <div className="text-sm text-muted-foreground">{r.counterpartyName}</div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span>檢驗 <strong className="text-foreground tabular-nums">{r.inspectTotal}</strong></span>
                          <span>件數 <strong className="text-foreground tabular-nums">{r.packageCount ?? "—"}</strong></span>
                          {r.logisticsNo && <span className="font-mono">{r.logisticsNo}</span>}
                        </div>
                      </div>
                    ))}
                    {dept.rows.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">無資料</p>
                    )}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted text-left text-muted-foreground">
                        <tr>
                          <th className="p-2">類型</th>
                          <th className="p-2">單據號碼</th>
                          <th className="p-2">名稱</th>
                          <th className="p-2 text-right whitespace-nowrap">檢驗總數</th>
                          <th className="p-2">物流號碼</th>
                          <th className="p-2 text-right whitespace-nowrap">件數</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dept.rows.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="p-2">{r.documentType}</td>
                            <td className="p-2 font-mono">
                              <Link
                                href={`/documents/${r.id}`}
                                className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                              >
                                {r.documentNumber}
                              </Link>
                            </td>
                            <td className="p-2">{r.counterpartyName ?? "—"}</td>
                            <td className="p-2 text-right tabular-nums">
                              {r.inspectTotal}
                            </td>
                            <td className="p-2 font-mono text-xs">
                              {r.logisticsNo ?? "—"}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {r.packageCount ?? "—"}
                            </td>
                          </tr>
                        ))}
                        {dept.rows.length === 0 && (
                          <tr>
                            <td className="p-3 text-muted-foreground" colSpan={6}>
                              無資料
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">進貨/退貨（已入庫）</h2>
            <div className="text-xs text-muted-foreground">
              單據數：{stocked?.totalDocs ?? (loading ? "…" : 0)}
            </div>
          </div>
          {!stocked ? (
            <p className="text-muted-foreground">{loading ? "載入中…" : "無資料"}</p>
          ) : (
            <div className="space-y-8">
              {stocked.byDepartment.map((dept) => (
                <section key={dept.departmentId} className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">
                      {dept.departmentName}
                    </h3>
                    <div className="text-xs text-muted-foreground">
                      筆數：{dept.rows.length}
                    </div>
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2">
                    {dept.rows.map((r) => (
                      <div key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/documents/${r.id}`}
                            className="font-mono text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                          >
                            {r.documentNumber}
                          </Link>
                          <span className="text-xs text-muted-foreground shrink-0">{r.documentType}</span>
                        </div>
                        {r.counterpartyName && (
                          <div className="text-sm text-muted-foreground">{r.counterpartyName}</div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span>檢驗 <strong className="text-foreground tabular-nums">{r.inspectTotal}</strong></span>
                          <span>箱數 <strong className="text-foreground tabular-nums">{r.packageCount ?? "—"}</strong></span>
                        </div>
                      </div>
                    ))}
                    {dept.rows.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">無資料</p>
                    )}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted text-left text-muted-foreground">
                        <tr>
                          <th className="p-2">類型</th>
                          <th className="p-2">名稱</th>
                          <th className="p-2">單據號碼</th>
                          <th className="p-2 text-right whitespace-nowrap">檢驗總數</th>
                          <th className="p-2 text-right whitespace-nowrap">箱數</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dept.rows.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="p-2">{r.documentType}</td>
                            <td className="p-2">{r.counterpartyName ?? "—"}</td>
                            <td className="p-2 font-mono">
                              <Link
                                href={`/documents/${r.id}`}
                                className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                              >
                                {r.documentNumber}
                              </Link>
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {r.inspectTotal}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {r.packageCount ?? "—"}
                            </td>
                          </tr>
                        ))}
                        {dept.rows.length === 0 && (
                          <tr>
                            <td className="p-3 text-muted-foreground" colSpan={5}>
                              無資料
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

