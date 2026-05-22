/**
 * 通路主檔維護
 * 檔案：src/app/(shell)/master/channels/page.tsx
 */

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { can } from "@/lib/permissions";

type Dept = { id: string; name: string };
type Channel = {
  id: string;
  channelCode: string;
  name: string;
  phone: string | null;
  address: string | null;
  lingyueCode: string | null;
  departmentId: string;
  department: Dept;
};

export default function ChannelsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canDeleteChannels = !!(role && can(role, "channels.delete"));
  const [depts, setDepts] = useState<Dept[]>([]);
  const [rows, setRows] = useState<Channel[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [keyword, setKeyword] = useState("");
  const [deptQueryId, setDeptQueryId] = useState<string>("");
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    channelCode: "",
    name: "",
    phone: "",
    address: "",
    lingyueCode: "",
    departmentId: "",
  });
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const keywordTrim = keyword.trim();
  const visibleRows = rows.filter((r) => {
    if (!keywordTrim) return true;
    const lower = keywordTrim.toLowerCase();
    return (
      r.channelCode.toLowerCase().includes(lower) ||
      r.name.toLowerCase().includes(lower) ||
      r.department.name.toLowerCase().includes(lower) ||
      (r.phone ?? "").toLowerCase().includes(lower) ||
      (r.address ?? "").toLowerCase().includes(lower) ||
      (r.lingyueCode ?? "").toLowerCase().includes(lower)
    );
  });
  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  const allVisibleSelected =
    canDeleteChannels &&
    visibleRows.length > 0 &&
    visibleRows.every((r) => !!sel[r.id]);
  const someVisibleSelected =
    canDeleteChannels &&
    visibleRows.some((r) => !!sel[r.id]) &&
    !allVisibleSelected;

  async function loadDeptsAndInit() {
    const cd = await fetch("/api/departments", {
      credentials: "include",
    }).then((r) => r.json());
    setDepts(cd);

    const firstNonPresale = (cd as Dept[]).find((d) => !d.name.includes("預售"));
    const nextQueryId = firstNonPresale?.id ?? (cd as Dept[])[0]?.id ?? "";
    setDeptQueryId((prev) => prev || nextQueryId);

    if ((cd as Dept[])[0] && !form.departmentId) {
      setForm((f) => ({ ...f, departmentId: (cd as Dept[])[0].id }));
    }
  }

  async function loadChannelsByDept(departmentId: string) {
    const dept = depts.find((d) => d.id === departmentId);
    if (!departmentId || dept?.name?.includes("預售")) {
      setRows([]);
      return;
    }
    const qs = new URLSearchParams({ departmentId });
    const ch = await fetch(`/api/channels?${qs.toString()}`, {
      credentials: "include",
    }).then((r) => r.json());
    setRows(ch);
  }

  // 僅初次掛載載入；load 內會讀當下 form，不列入依賴避免無限重取
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadDeptsAndInit();
    });
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load 刻意不列入；見上
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadChannelsByDept(deptQueryId);
    });
    return () => cancelAnimationFrame(id);
  }, [deptQueryId, depts]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg(null);
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...form,
        phone: form.phone || null,
        address: form.address || null,
        lingyueCode: form.lingyueCode || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateMsg(j.error ?? (await res.text()));
      return;
    }
    if (typeof j.message === "string" && j.message.trim()) {
      setCreateMsg(j.message);
    }
    setForm((f) => ({
      ...f,
      channelCode: "",
      name: "",
      phone: "",
      address: "",
      lingyueCode: "",
    }));
    void loadChannelsByDept(deptQueryId);
  }

  async function importExcel(file: File | null) {
    if (!file) return;
    setImportMsg(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/channels/import", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportMsg(j.error ?? (await res.text()));
        return;
      }
      if (typeof j.message === "string" && j.message.trim()) {
        setImportMsg(j.message);
        void loadChannelsByDept(deptQueryId);
        return;
      }
      const errTail =
        Array.isArray(j.errors) && j.errors.length
          ? `\n錯誤：\n${j.errors.slice(0, 15).join("\n")}`
          : "";
      setImportMsg(
        `匯入 ${j.imported ?? 0} 筆（新增 ${j.created ?? 0}／更新 ${j.updated ?? 0}／無變更 ${j.unchanged ?? 0}；略過空列 ${j.skippedEmpty ?? 0}）${errTail}`,
      );
      void loadChannelsByDept(deptQueryId);
    } finally {
      setImporting(false);
    }
  }

  async function batchDel() {
    if (!selectedIds.length) return;
    if (!confirm(`刪除 ${selectedIds.length} 筆？`)) return;
    await fetch("/api/channels/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: selectedIds }),
    });
    setSel({});
    void loadChannelsByDept(deptQueryId);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">通路/廠商主檔</h1>
      </header>
      <form
        onSubmit={create}
        className="panel panel-body grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        <input
          className="ui-input"
          placeholder="通路代碼"
          value={form.channelCode}
          onChange={(e) =>
            setForm((f) => ({ ...f, channelCode: e.target.value }))
          }
          required
        />
        <input
          className="ui-input"
          placeholder="名稱"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <select
          className="ui-input"
          value={form.departmentId}
          onChange={(e) =>
            setForm((f) => ({ ...f, departmentId: e.target.value }))
          }
          required
        >
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          className="ui-input"
          placeholder="電話"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <input
          className="ui-input md:col-span-2"
          placeholder="地址"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <input
          className="ui-input"
          placeholder="凌越代碼"
          value={form.lingyueCode}
          onChange={(e) =>
            setForm((f) => ({ ...f, lingyueCode: e.target.value }))
          }
        />
        <button
          type="submit"
          className="btn-primary sm:col-span-2"
        >
          新增
        </button>
      </form>
      {createMsg && (
        <pre className="text-xs whitespace-pre-wrap text-foreground bg-muted p-2 rounded-md max-w-3xl overflow-auto border border-border">
          {createMsg}
        </pre>
      )}

      <div className="rounded-xl border border-border bg-card text-card-foreground p-4 text-sm space-y-2 max-w-3xl shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">Excel 匯入（.xlsx）</span>
          <Link
            href="/api/import/template/channels"
            prefetch={false}
            className="text-sm rounded-md border border-input bg-secondary/60 px-3 py-1.5 text-secondary-foreground hover:bg-secondary"
          >
            下載範本
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          表頭需含：<strong>通路代碼、名稱、部門、電話、地址、凌越代碼</strong>（部門須與系統部門名稱一致）；每列上述欄位皆須有值。同一代碼會更新既有資料。
        </p>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span className="px-3 py-1.5 rounded-md border border-input bg-secondary/50 text-sm">
            {importing ? "匯入中…" : "選擇檔案"}
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              void importExcel(f);
            }}
          />
        </label>
        {importMsg && (
          <pre className="text-xs whitespace-pre-wrap text-foreground bg-muted p-2 rounded-md max-h-48 overflow-auto border border-border">
            {importMsg}
          </pre>
        )}
      </div>

      <div className="flex gap-2">
        <select
          className="ui-input"
          value={deptQueryId}
          onChange={(e) => {
            setSel({});
            setDeptQueryId(e.target.value);
          }}
        >
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          className="ui-input"
          placeholder="關鍵字查詢（代碼 / 名稱 / 部門 / 電話 / 地址 / 凌越）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        {canDeleteChannels && (
          <button
            type="button"
            className="text-sm px-3 py-1 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void batchDel()}
          >
            批次刪除
          </button>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {visibleRows.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1">
            <div className="flex items-start gap-2">
              {canDeleteChannels && (
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={!!sel[r.id]}
                  onChange={(e) =>
                    setSel((s) => ({ ...s, [r.id]: e.target.checked }))
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{r.channelCode}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{r.department.name}</span>
                </div>
                <div className="text-sm mt-0.5">{r.name}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                  {r.phone && <span>{r.phone}</span>}
                  {r.lingyueCode && <span className="font-mono">凌越 {r.lingyueCode}</span>}
                </div>
                {r.address && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.address}</div>
                )}
              </div>
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
              <th className="p-2">
                {canDeleteChannels && (
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSel((s) => {
                        const next = { ...s };
                        for (const r of visibleRows) {
                          if (on) next[r.id] = true;
                          else delete next[r.id];
                        }
                        return next;
                      });
                    }}
                    aria-label="toggle select all visible rows"
                  />
                )}
              </th>
              <th className="text-left p-2">代碼</th>
              <th className="text-left p-2">名稱</th>
              <th className="text-left p-2">部門</th>
              <th className="text-left p-2">電話</th>
              <th className="text-left p-2">地址</th>
              <th className="text-left p-2">凌越</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2">
                  {canDeleteChannels && (
                    <input
                      type="checkbox"
                      checked={!!sel[r.id]}
                      onChange={(e) =>
                        setSel((s) => ({ ...s, [r.id]: e.target.checked }))
                      }
                    />
                  )}
                </td>
                <td className="p-2 font-mono">{r.channelCode}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.department.name}</td>
                <td className="p-2">{r.phone}</td>
                <td className="p-2">{r.address}</td>
                <td className="p-2">{r.lingyueCode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
