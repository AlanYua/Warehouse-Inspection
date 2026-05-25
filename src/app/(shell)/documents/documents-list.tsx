/**
 * (client) 單據列表互動
 * 檔案：src/app/(shell)/documents/documents-list.tsx
 */

"use client";

import Link from "next/link";
import {
  Field,
  FilterBar,
  ListCard,
  MobileList,
  TableShell,
} from "@/components/ui/page-shell";
import { useEffect, useState } from "react";
import { DocumentStatus, Role } from "@prisma/client";
import { canDeleteDocument } from "@/lib/documents/delete-guard";

type Dept = { id: string; name: string };

type Row = {
  id: string;
  documentNumber: string;
  documentDate: string | null;
  createdAt: string;
  documentType: string;
  flow: "OUT" | "IN";
  status: DocumentStatus;
  stockedAt: string | null;
  counterpartyName: string | null;
  channelCode: string | null;
  department: { name: string };
  updatedAt: string;
  lockedBy: { name: string } | null;
};

const statusZh: Record<DocumentStatus, string> = {
  PENDING: "未完成",
  INSPECTING: "驗收中",
  COMPLETED: "已完成",
  SHIPPED: "已出貨",
};

function statusLabel(row: Row): string {
  if (row.status === "COMPLETED" && row.stockedAt) {
    return "已入庫";
  }
  return statusZh[row.status] ?? "—";
}

const flowZh: Record<"OUT" | "IN", string> = {
  OUT: "驗出",
  IN: "驗入",
};

function rowDeletable(role: Role | undefined, row: Row, canDelete: boolean) {
  if (!canDelete || !role) return false;
  return canDeleteDocument(role, row).ok;
}

export default function DocumentsList({
  canDelete = false,
  role,
}: {
  canDelete?: boolean;
  role?: Role;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [deptId, setDeptId] = useState("");
  const [docType, setDocType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const visibleRows = rows;
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => !!selected[r.id]);
  const someVisibleSelected =
    visibleRows.some((r) => !!selected[r.id]) && !allVisibleSelected;

  async function fetchList() {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (deptId) sp.set("departmentId", deptId);
    if (docType) sp.set("documentType", docType);
    if (dateFrom) sp.set("dateFrom", dateFrom);
    if (dateTo) sp.set("dateTo", dateTo);
    const res = await fetch(`/api/documents?${sp}`, { credentials: "include" });
    if (res.ok) setRows(await res.json());
  }

  async function exportSelectedExcel() {
    if (selectedIds.length === 0) {
      alert("請先勾選單據");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/documents/export-excel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: selectedIds }),
      });
      if (!res.ok) {
        alert((await res.text()) || "匯出失敗");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? "documents.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function removeRow(row: Row) {
    if (!rowDeletable(role, row, canDelete)) return;
    if (
      !window.confirm(
        `確定刪除「${row.documentNumber}」？此動作無法復原。`,
      )
    ) {
      return;
    }
    const { requestConfirmPassword } = await import(
      "@/lib/confirm-password-client"
    );
    const confirmPassword = await requestConfirmPassword({
      title: "確認刪除單據",
      description: `刪除「${row.documentNumber}」`,
    });
    if (!confirmPassword) return;
    const res = await fetch(`/api/documents/${row.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmPassword }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    setSelected((s) => {
      const next = { ...s };
      delete next[row.id];
      return next;
    });
    void fetchList();
  }

  useEffect(() => {
    void fetchList();
    // 僅「狀態」變更時自動重查；部門／單據類型／關鍵字請按「查詢」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    void (async () => {
      const [dRes, tRes] = await Promise.all([
        fetch("/api/departments", { credentials: "include" }),
        fetch("/api/document-types", { credentials: "include" }),
      ]);
      if (dRes.ok) setDepts(await dRes.json());
      if (tRes.ok) {
        const items = (await tRes.json()) as { name: string }[];
        setDocTypes(items.map((x) => x.name));
      }
    })();
  }, []);

  async function batchDeleteSelected() {
    if (!canDelete) return;
    if (selectedIds.length === 0) {
      alert("請先勾選單據");
      return;
    }
    const blocked = selectedIds.filter((id) => {
      const row = visibleRows.find((r) => r.id === id);
      return row && !rowDeletable(role, row, canDelete);
    });
    if (blocked.length > 0) {
      alert("已出貨或已入庫單據不可刪除，請取消勾選後再試。");
      return;
    }
    const docNos = selectedIds
      .map((id) => visibleRows.find((r) => r.id === id)?.documentNumber)
      .filter(Boolean)
      .slice(0, 10) as string[];
    const preview = docNos.length ? `\n\n前幾筆：${docNos.join("、")}` : "";
    if (
      !window.confirm(
        `確定批次刪除 ${selectedIds.length} 筆單據？此動作無法復原。${preview}`,
      )
    ) {
      return;
    }
    const { requestConfirmPassword } = await import(
      "@/lib/confirm-password-client"
    );
    const confirmPassword = await requestConfirmPassword({
      title: "確認批次刪除",
      description: `將刪除 ${selectedIds.length} 筆單據`,
    });
    if (!confirmPassword) return;
    setBatchDeleting(true);
    try {
      const res = await fetch("/api/documents/batch-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: selectedIds, confirmPassword }),
      });
      const j = (await res.json().catch(() => ({}))) as
        | { ok: true; count: number; missingIds?: string[] }
        | { error?: string; missingIds?: string[] };
      if (!res.ok) {
        alert(
          ("error" in j ? j.error : undefined) ||
            (await res.text().catch(() => "")) ||
            "批次刪除失敗",
        );
        return;
      }
      setSelected({});
      void fetchList();
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="狀態">
          <select
            className="ui-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部</option>
            <option value="PENDING">未完成</option>
            <option value="INSPECTING">驗收中</option>
            <option value="COMPLETED">已完成</option>
            <option value="SHIPPED">已出貨</option>
            <option value="STOCKED">已入庫</option>
          </select>
        </Field>
        <Field label="部門">
          <select
            className="ui-select"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
          >
            <option value="">全部</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="單據類型">
          <select
            className="ui-select"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            <option value="">全部</option>
            {docTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="單據日期起">
          <input
            type="date"
            title="有單據日期者依單據日期；無則依匯入／建立日"
            className="ui-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </Field>
        <Field label="單據日期迄">
          <input
            type="date"
            title="有單據日期者依單據日期；無則依匯入／建立日"
            className="ui-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </Field>
        <Field label="關鍵字" className="field-wide">
          <input
            className="ui-input"
            placeholder="至少 3 個字"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void fetchList()}
          />
          {q.length > 0 && q.length < 3 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              需至少 3 個字才會搜尋
            </p>
          )}
        </Field>
        <div className="toolbar-stretch">
          <button type="button" className="btn-primary" onClick={() => void fetchList()}>
            查詢
          </button>
          <button
            type="button"
            disabled={exporting}
            className="btn-secondary"
            onClick={() => void exportSelectedExcel()}
          >
            {exporting ? "匯出中…" : "Excel 匯出"}
          </button>
          <Link
            href={`/print/documents?ids=${selectedIds.join(",")}`}
            className="btn-secondary"
          >
            批次列印
          </Link>
          {canDelete && (
            <button
              type="button"
              disabled={batchDeleting}
              className="btn-destructive"
              onClick={() => void batchDeleteSelected()}
            >
              {batchDeleting ? "刪除中…" : "批次刪除"}
            </button>
          )}
        </div>
      </FilterBar>

      <MobileList>
        {visibleRows.map((r) => {
          const actionLabel =
            r.status === "SHIPPED" || r.status === "COMPLETED"
              ? "檢視"
              : r.status === "INSPECTING"
                ? "進入"
                : "驗收";
          return (
            <ListCard key={r.id}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={!!selected[r.id]}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [r.id]: e.target.checked }))
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/documents/${r.id}`}
                      className="font-mono text-sm font-medium text-primary truncate hover:underline underline-offset-4"
                    >
                      {r.documentNumber}
                    </Link>
                    <span
                      className={
                        r.status === "COMPLETED" || r.status === "SHIPPED"
                          ? "badge-done"
                          : r.status === "INSPECTING"
                            ? "badge-active"
                            : "badge-pending"
                      }
                    >
                      {statusLabel(r)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span suppressHydrationWarning>
                      {new Date(
                        r.documentDate ?? r.createdAt,
                      ).toLocaleDateString()}
                    </span>
                    <span>{r.documentType}</span>
                    <span>{flowZh[r.flow] ?? "—"}</span>
                    <span>{r.department.name}</span>
                  </div>
                  {(r.counterpartyName || r.channelCode) && (
                    <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-muted-foreground">
                      {r.counterpartyName && <span>{r.counterpartyName}</span>}
                      {r.channelCode && (
                        <span className="font-mono">{r.channelCode}</span>
                      )}
                    </div>
                  )}
                  {r.status === "INSPECTING" && r.lockedBy && (
                    <div className="text-xs text-amber-700 mt-0.5">
                      {r.lockedBy.name} 驗收中
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span
                  className="text-[11px] text-muted-foreground"
                  suppressHydrationWarning
                >
                  更新 {new Date(r.updatedAt).toLocaleString()}
                </span>
                <div className="flex gap-3">
                  <Link
                    href={`/documents/${r.id}`}
                    className="text-xs font-medium text-primary hover:underline underline-offset-4"
                  >
                    {actionLabel}
                  </Link>
                  {rowDeletable(role, r, canDelete) && (
                    <button
                      type="button"
                      className="text-xs font-medium text-destructive hover:underline underline-offset-4"
                      onClick={() => void removeRow(r)}
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>
            </ListCard>
          );
        })}
        {rows.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            無符合條件的單據
          </p>
        )}
      </MobileList>

      <TableShell>
        <table className="data-table">
          <thead>
            <tr>
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSelected((s) => {
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
              </th>
              <th className="p-2">單據號碼</th>
              <th className="p-2 whitespace-nowrap">單據日期</th>
              <th className="p-2">類型</th>
              <th className="p-2 whitespace-nowrap">驗出/驗入</th>
              <th className="p-2">狀態</th>
              <th className="p-2">部門</th>
              <th className="p-2 whitespace-nowrap">通路</th>
              <th className="p-2">名稱</th>
              <th className="p-2">更新</th>
              <th className="p-2"></th>
              {canDelete && <th className="p-2 w-24">管理</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={!!selected[r.id]}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [r.id]: e.target.checked }))
                    }
                  />
                </td>
                <td className="p-2 font-mono">{r.documentNumber}</td>
                <td
                  className="p-2 text-xs whitespace-nowrap"
                  title={
                    r.documentDate
                      ? undefined
                      : "無單據日期，為匯入／建立日"
                  }
                  suppressHydrationWarning
                >
                  {new Date(
                    r.documentDate ?? r.createdAt,
                  ).toLocaleDateString()}
                </td>
                <td className="p-2">{r.documentType}</td>
                <td className="p-2 whitespace-nowrap">{flowZh[r.flow] ?? "—"}</td>
                <td className="p-2">
                  {statusLabel(r)}
                  {r.status === "INSPECTING" && r.lockedBy && (
                    <span className="text-xs text-amber-700 block">
                      {r.lockedBy.name}
                    </span>
                  )}
                </td>
                <td className="p-2">{r.department.name}</td>
                <td className="p-2 font-mono">{r.channelCode ?? "—"}</td>
                <td className="p-2">{r.counterpartyName ?? "—"}</td>
                <td
                  className="p-2 text-xs whitespace-nowrap"
                  suppressHydrationWarning
                >
                  {new Date(r.updatedAt).toLocaleString()}
                </td>
                <td className="p-2">
                  {r.status === "SHIPPED" ? (
                    <Link
                      href={`/documents/${r.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      檢視
                    </Link>
                  ) : r.status === "INSPECTING" || r.status === "COMPLETED" ? (
                    <Link
                      href={`/documents/${r.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {r.status === "COMPLETED" ? "檢視" : "進入"}
                    </Link>
                  ) : (
                    <Link
                      href={`/documents/${r.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      驗收
                    </Link>
                  )}
                </td>
                {canDelete && (
                  <td className="p-2">
                    {rowDeletable(role, r, canDelete) ? (
                      <button
                        type="button"
                        className="text-sm text-destructive underline-offset-4 hover:underline"
                        onClick={() => void removeRow(r)}
                      >
                        刪除
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
