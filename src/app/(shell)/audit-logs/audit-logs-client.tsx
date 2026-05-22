/**
 * (client) 操作紀錄列表與篩選
 * 檔案：src/app/(shell)/audit-logs/audit-logs-client.tsx
 */

"use client";

import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/audit";
import {
  Field,
  FilterBar,
  ListCard,
  MobileList,
  TableShell,
} from "@/components/ui/page-shell";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  userId: string | null;
  username: string | null;
  userName: string | null;
  role: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: string;
};

type UserOpt = { id: string; username: string; name: string };

const ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABEL) as Array<
  [AuditAction, string]
>;

function humanizeAuditSummary(summary: string): string {
  return summary
    .replace(/驗收方式=BARCODE/g, "驗收方式：條碼驗收")
    .replace(/驗收方式=MANUAL/g, "驗收方式：手動驗收")
    .replace(/驗收量×/g, "條碼驗收量×")
    .replace(/驗收量x/gi, "條碼驗收量×");
}

function todayLocal(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function rowDisplay(r: Row, userById: Map<string, UserOpt>) {
  const userOpt = r.userId ? userById.get(r.userId) : null;
  const display =
    r.userName ||
    userOpt?.name ||
    r.username ||
    userOpt?.username ||
    "（已刪除）";
  const userLine = r.username || userOpt?.username;
  return { display, userLine };
}

export default function AuditLogsClient({ users }: { users: UserOpt[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [from, setFrom] = useState<string>(todayLocal(-7));
  const [to, setTo] = useState<string>(todayLocal(0));

  const buildUrl = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (action) params.set("action", action);
      if (userId) params.set("userId", userId);
      if (from) params.set("from", `${from}T00:00:00`);
      if (to) params.set("to", `${to}T23:59:59`);
      params.set("take", "50");
      if (cursor) params.set("cursor", cursor);
      return `/api/audit-logs?${params.toString()}`;
    },
    [q, action, userId, from, to],
  );

  const load = useCallback(
    async (append: boolean, cursor: string | null) => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(buildUrl(cursor), { credentials: "include" });
        const text = await res.text();
        if (!res.ok) {
          setErr(text || `HTTP ${res.status}`);
          return;
        }
        const data = JSON.parse(text) as { items: Row[]; nextCursor: string | null };
        setRows((prev) => (append ? [...prev, ...data.items] : data.items));
        setNextCursor(data.nextCursor);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [buildUrl],
  );

  useEffect(() => {
    void load(false, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userById = useMemo(() => {
    const m = new Map<string, UserOpt>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="關鍵字" className="field-wide">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="摘要 / 對象 / 人名 / 帳號"
            className="ui-input"
          />
        </Field>
        <Field label="動作">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="ui-select"
          >
            <option value="">全部</option>
            {ACTION_OPTIONS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="人員">
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="ui-select"
          >
            <option value="">全部</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}（{u.username}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="起">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ui-input"
          />
        </Field>
        <Field label="迄">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ui-input"
          />
        </Field>
        <div className="toolbar-stretch">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(false, null)}
            className="btn-primary"
          >
            查詢
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setQ("");
              setAction("");
              setUserId("");
              setFrom(todayLocal(-7));
              setTo(todayLocal(0));
              setTimeout(() => void load(false, null), 0);
            }}
            className="btn-secondary"
          >
            重置
          </button>
        </div>
      </FilterBar>

      {err && <p className="alert-error whitespace-pre-wrap break-all">{err}</p>}

      <MobileList>
        {rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {loading ? "讀取中…" : "查無紀錄。"}
          </p>
        ) : (
          rows.map((r) => {
            const { display, userLine } = rowDisplay(r, userById);
            return (
              <ListCard key={r.id}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                  <span className="badge-pending text-[11px]">
                    {AUDIT_ACTION_LABEL[r.action as AuditAction] ?? r.action}
                  </span>
                </div>
                <div className="font-medium text-sm">{display}</div>
                {userLine && (
                  <div className="font-mono text-xs text-muted-foreground">{userLine}</div>
                )}
                {(r.targetType || r.targetLabel) && (
                  <div className="text-xs text-muted-foreground">
                    {r.targetType && <span>{r.targetType} · </span>}
                    {r.targetLabel}
                  </div>
                )}
                <p className="text-xs whitespace-pre-wrap break-all">
                  {r.summary ? humanizeAuditSummary(r.summary) : "—"}
                </p>
                {r.ip && (
                  <p className="text-[11px] font-mono text-muted-foreground">IP {r.ip}</p>
                )}
              </ListCard>
            );
          })
        )}
      </MobileList>

      <TableShell>
        <table className="data-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>操作者</th>
              <th>動作</th>
              <th>對象</th>
              <th>摘要</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {loading ? "讀取中…" : "查無紀錄。"}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const { display, userLine } = rowDisplay(r, userById);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="font-medium">{display}</div>
                      {userLine && (
                        <div className="font-mono text-xs text-muted-foreground">
                          {userLine}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {AUDIT_ACTION_LABEL[r.action as AuditAction] ?? r.action}
                    </td>
                    <td className="text-xs">
                      {r.targetType && (
                        <div className="text-muted-foreground">{r.targetType}</div>
                      )}
                      {r.targetLabel && <div>{r.targetLabel}</div>}
                    </td>
                    <td className="text-xs whitespace-pre-wrap break-all">
                      {r.summary ? humanizeAuditSummary(r.summary) : "—"}
                      {r.meta != null && typeof r.meta === "object" && (
                        <details className="mt-1">
                          <summary className="text-[11px] text-muted-foreground cursor-pointer select-none">
                            詳細
                          </summary>
                          <pre className="text-[11px] mt-1 bg-muted/40 p-2 rounded whitespace-pre-wrap break-all">
                            {JSON.stringify(r.meta, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-muted-foreground font-mono">
                      {r.ip || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableShell>

      <div className="flex justify-center">
        {nextCursor ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(true, nextCursor)}
            className="btn-secondary"
          >
            {loading ? "讀取中…" : "載入更多"}
          </button>
        ) : (
          rows.length > 0 && (
            <span className="text-xs text-muted-foreground">已到底</span>
          )
        )}
      </div>
    </div>
  );
}
