/**
 * 退貨登記
 * 檔案：src/app/(shell)/returns/page.tsx
 */

"use client";

import { BarcodeCamera } from "@/components/BarcodeCamera";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type Dept = { id: string; name: string };

function toDateValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ReturnsPage() {
  const { data: session } = useSession();
  const selfName = session?.user?.name?.trim() ?? "";
  const [depts, setDepts] = useState<Dept[]>([]);
  const [rows, setRows] = useState<
    Array<{
      id: string;
      logisticsNo: string;
      packageName: string;
      pieceCount: number;
      recipientName: string;
      department: Dept;
      receivedAt?: string | null;
      createdAt: string;
    }>
  >([]);
  const [form, setForm] = useState({
    logisticsNo: "",
    packageName: "",
    pieceCount: 1,
    departmentId: "",
    recipientName: "",
  });
  const [query, setQuery] = useState(() => {
    const now = new Date();
    const today = new Date(now);
    return {
      departmentId: "",
      receivedFrom: toDateValue(today),
      receivedTo: toDateValue(today),
    };
  });
  const [postErr, setPostErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [camOpen, setCamOpen] = useState(false);

  async function load(opts?: {
    departmentId?: string;
    receivedFrom?: string;
    receivedTo?: string;
  }) {
    const d = await fetch("/api/departments", { credentials: "include" }).then(
      (x) => x.json(),
    );
    setDepts(d);
    const params = new URLSearchParams();
    if (opts?.departmentId) params.set("departmentId", opts.departmentId);
    if (opts?.receivedFrom) params.set("receivedFrom", opts.receivedFrom);
    if (opts?.receivedTo) params.set("receivedTo", opts.receivedTo);
    const url = params.toString() ? `/api/returns?${params.toString()}` : "/api/returns";
    const r = await fetch(url, { credentials: "include" });
    if (r.ok) setRows(await r.json());
    else setRows([]);
    if (d[0] && !form.departmentId) {
      setForm((f) => ({ ...f, departmentId: d[0].id }));
    }
    if (d[0] && !query.departmentId) {
      setQuery((q) => ({ ...q, departmentId: d[0].id }));
    }
  }

  // 僅初次掛載載入；load 依當下 form 決定預設部門
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load 刻意不列入；見上
  }, []);

  useEffect(() => {
    if (!selfName) return;
    const id = requestAnimationFrame(() => {
      setForm((f) =>
        f.recipientName === "" ? { ...f, recipientName: selfName } : f,
      );
    });
    return () => cancelAnimationFrame(id);
  }, [selfName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPostErr(null);
    setNotice(null);
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, receivedAt: new Date().toISOString() }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err =
        typeof j.error === "string"
          ? j.error
          : j.error != null
            ? JSON.stringify(j.error)
            : "請求失敗";
      setPostErr(err);
      return;
    }
    if (j.duplicate && typeof j.message === "string") {
      setNotice(j.message);
      window.alert(j.message);
    }
    setForm((f) => ({
      ...f,
      logisticsNo: "",
      packageName: "",
      pieceCount: 1,
      recipientName: selfName || f.recipientName,
    }));
    void load(query);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        退貨驗收
      </h1>
      <form
        onSubmit={submit}
        className="grid grid-cols-1 md:grid-cols-2 gap-2 p-4 border border-border rounded-xl bg-card text-card-foreground text-sm max-w-2xl shadow-xs"
      >
        {postErr && (
          <div className="md:col-span-2 text-sm text-destructive">{postErr}</div>
        )}
        {notice && (
          <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {notice}
          </div>
        )}
        <div className="flex gap-2 items-center">
          <input
            className="rounded-md border border-input bg-background px-2 py-1 flex-1 min-w-0 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="物流號碼"
            value={form.logisticsNo}
            onChange={(e) =>
              setForm((f) => ({ ...f, logisticsNo: e.target.value }))
            }
            required
          />
          <button
            type="button"
            className="shrink-0 text-xs px-2 py-1.5 rounded-md border border-input bg-secondary/50 hover:bg-secondary"
            onClick={() => setCamOpen(true)}
          >
            相機掃碼
          </button>
        </div>
        <input
          className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="貨件名稱"
          value={form.packageName}
          onChange={(e) =>
            setForm((f) => ({ ...f, packageName: e.target.value }))
          }
          required
        />
        <input
          type="number"
          min={1}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={form.pieceCount}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              pieceCount: Number(e.target.value) || 1,
            }))
          }
        />
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={form.departmentId}
          onChange={(e) =>
            setForm((f) => ({ ...f, departmentId: e.target.value }))
          }
        >
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-input bg-background px-2 py-1 md:col-span-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="收貨人"
          value={form.recipientName}
          onChange={(e) =>
            setForm((f) => ({ ...f, recipientName: e.target.value }))
          }
          required
        />
        <button
          type="submit"
          className="md:col-span-2 rounded-md bg-primary text-primary-foreground py-2 font-medium shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          新增退貨驗收
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-4 border border-border rounded-xl bg-card text-card-foreground text-sm shadow-xs">
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={query.departmentId}
          onChange={(e) => setQuery((q) => ({ ...q, departmentId: e.target.value }))}
        >
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={query.receivedFrom}
          onChange={(e) => setQuery((q) => ({ ...q, receivedFrom: e.target.value }))}
        />
        <input
          type="date"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={query.receivedTo}
          onChange={(e) => setQuery((q) => ({ ...q, receivedTo: e.target.value }))}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-md border border-input bg-secondary/50 hover:bg-secondary py-1 font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              const now = new Date();
              setQuery((q) => ({
                ...q,
                receivedFrom: toDateValue(now),
                receivedTo: toDateValue(now),
              }));
            }}
          >
            今天
          </button>
          <button
            type="button"
            className="flex-1 rounded-md bg-primary text-primary-foreground py-1 font-medium shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void load(query)}
          >
            查詢
          </button>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-sm font-medium">{r.logisticsNo}</span>
              <span className="text-xs text-muted-foreground shrink-0">{r.department.name}</span>
            </div>
            <div className="text-sm">{r.packageName}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>件數 <strong className="text-foreground">{r.pieceCount}</strong></span>
              <span>收貨人 {r.recipientName}</span>
              <span suppressHydrationWarning>
                {new Date(r.receivedAt ?? r.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">無資料</p>
        )}
      </div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto border border-border rounded-xl bg-card text-sm shadow-xs">
        <table className="min-w-full">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left p-2">收貨時間</th>
              <th className="text-left p-2">物流號</th>
              <th className="text-left p-2">貨件</th>
              <th className="text-right p-2">件數</th>
              <th className="text-left p-2">部門</th>
              <th className="text-left p-2">收貨人</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 whitespace-nowrap">
                  {new Date(r.receivedAt ?? r.createdAt).toLocaleString()}
                </td>
                <td className="p-2 font-mono">{r.logisticsNo}</td>
                <td className="p-2">{r.packageName}</td>
                <td className="p-2 text-right">{r.pieceCount}</td>
                <td className="p-2">{r.department.name}</td>
                <td className="p-2">{r.recipientName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {camOpen && (
        <BarcodeCamera
          onDecoded={(text) => setForm((f) => ({ ...f, logisticsNo: text }))}
          onClose={() => setCamOpen(false)}
        />
      )}
    </div>
  );
}
