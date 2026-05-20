"use client";

import { useState } from "react";
import { flowZh } from "@/app/(shell)/documents/[id]/inspect-types";

type HistoryRow = {
  lineId: string;
  flow: "OUT" | "IN";
  documentType: string;
  documentNumber: string;
  counterpartyName: string | null;
  departmentName: string;
  eventAt: string;
  statusLabel: string;
  docQuantity: number;
  inspectQuantity: number;
};

type Payload = {
  product: {
    productCode: string;
    name: string;
    barcode: string | null;
  } | null;
  summary: { netDocQty: number; netInspectQty: number };
  total: number;
  rows: HistoryRow[];
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtAbs(n: number) {
  const a = Math.abs(n);
  return Number.isInteger(a) ? String(a) : a.toFixed(2).replace(/\.?0+$/, "");
}

function fmtSignedQty(n: number) {
  if (n === 0) return "0";
  const s = fmtAbs(n);
  return n > 0 ? `+${s}` : `-${s}`;
}

function qtyClass(n: number) {
  if (n > 0) return "text-emerald-700 dark:text-emerald-400";
  if (n < 0) return "text-orange-700 dark:text-orange-400";
  return "";
}

export default function ShippingHistoryClient() {
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [flow, setFlow] = useState<"" | "OUT" | "IN">("");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    const q = keyword.trim();
    if (!q) {
      setErr("請輸入貨號或條碼");
      setData(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams({ q });
      if (dateFrom) sp.set("dateFrom", dateFrom);
      if (dateTo) sp.set("dateTo", dateTo);
      if (flow) sp.set("flow", flow);
      const res = await fetch(`/api/reports/shipping-history?${sp}`, {
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : `查詢失敗（${res.status}）`);
        setData(null);
        return;
      }
      setData(j as Payload);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            出貨歷史紀錄
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            僅供查詢檢視，無法編輯。僅含已出貨／已入庫單據；入庫為正（+）、出貨為負（-）
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div>
            <label className="block text-xs text-muted-foreground">貨號／條碼</label>
            <input
              type="text"
              className="mt-0.5 block w-56 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="掃描或輸入"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">起日</label>
            <input
              type="date"
              className="mt-0.5 block rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">迄日</label>
            <input
              type="date"
              className="mt-0.5 block rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">方向</label>
            <select
              className="mt-0.5 block rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
              value={flow}
              onChange={(e) => setFlow(e.target.value as "" | "OUT" | "IN")}
            >
              <option value="">全部</option>
              <option value="OUT">驗出</option>
              <option value="IN">驗入</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "查詢中…" : "查詢"}
          </button>
        </form>
      </div>

      {err ? (
        <pre className="text-xs bg-muted text-muted-foreground p-2 rounded-md overflow-auto border border-border">
          {err}
        </pre>
      ) : null}

      {data?.product ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">貨號 </span>
            <span className="font-mono font-medium">{data.product.productCode}</span>
          </div>
          <div>{data.product.name}</div>
          {data.product.barcode ? (
            <div>
              <span className="text-muted-foreground">條碼 </span>
              <span className="font-mono">{data.product.barcode}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>
            淨單據量{" "}
            <strong className={`tabular-nums ${qtyClass(data.summary.netDocQty)}`}>
              {fmtSignedQty(data.summary.netDocQty)}
            </strong>
          </span>
          <span>
            淨驗收量{" "}
            <strong className={`tabular-nums ${qtyClass(data.summary.netInspectQty)}`}>
              {fmtSignedQty(data.summary.netInspectQty)}
            </strong>
          </span>
          <span>筆數 {data.total}</span>
        </div>
      ) : null}

      {data && data.rows.length === 0 && !loading ? (
        <p className="text-muted-foreground">查無紀錄</p>
      ) : null}

      {data && data.rows.length > 0 ? (
        <>
          <div className="md:hidden space-y-2">
            {data.rows.map((r) => (
              <div
                key={r.lineId}
                className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={
                      r.flow === "OUT"
                        ? "text-xs font-medium text-orange-700 dark:text-orange-400"
                        : "text-xs font-medium text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {flowZh[r.flow]}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.eventAt)}</span>
                </div>
                <div className="font-mono text-sm font-medium">{r.documentNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {r.documentType} · {r.departmentName} · {r.statusLabel}
                </div>
                {r.counterpartyName ? (
                  <div className="text-sm text-muted-foreground">{r.counterpartyName}</div>
                ) : null}
                <div className="flex gap-4 text-xs">
                  <span>
                    單據量{" "}
                    <strong className={`tabular-nums ${qtyClass(r.docQuantity)}`}>
                      {fmtSignedQty(r.docQuantity)}
                    </strong>
                  </span>
                  <span>
                    驗收量{" "}
                    <strong className={`tabular-nums ${qtyClass(r.inspectQuantity)}`}>
                      {fmtSignedQty(r.inspectQuantity)}
                    </strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-2">日期</th>
                  <th className="p-2">方向</th>
                  <th className="p-2">單據類型</th>
                  <th className="p-2">單據號碼</th>
                  <th className="p-2">部門</th>
                  <th className="p-2">對象</th>
                  <th className="p-2">狀態</th>
                  <th className="p-2 text-right">單據量</th>
                  <th className="p-2 text-right">驗收量</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.lineId} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.eventAt)}</td>
                    <td className="p-2">{flowZh[r.flow]}</td>
                    <td className="p-2">{r.documentType}</td>
                    <td className="p-2 font-mono">{r.documentNumber}</td>
                    <td className="p-2">{r.departmentName}</td>
                    <td className="p-2">{r.counterpartyName ?? "—"}</td>
                    <td className="p-2">{r.statusLabel}</td>
                    <td className={`p-2 text-right tabular-nums ${qtyClass(r.docQuantity)}`}>
                      {fmtSignedQty(r.docQuantity)}
                    </td>
                    <td className={`p-2 text-right tabular-nums ${qtyClass(r.inspectQuantity)}`}>
                      {fmtSignedQty(r.inspectQuantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
