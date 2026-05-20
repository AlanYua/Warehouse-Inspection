/**
 * (client) 操作紀錄列表與篩選
 * 檔案：src/app/(shell)/audit-logs/audit-logs-client.tsx
 */

"use client";

import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/audit";
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

/** 舊紀錄摘要用程式風格寫入時，列表顯示改為口語／一致用語 */
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
    // 首次載入；不依賴 load 避免無限循環
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userById = useMemo(() => {
    const m = new Map<string, UserOpt>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block">關鍵字</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="摘要 / 對象 / 人名 / 帳號"
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[12rem]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">動作</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[12rem]"
            >
              <option value="">全部</option>
              {ACTION_OPTIONS.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">人員</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[10rem]"
            >
              <option value="">全部</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}（{u.username}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">起</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">迄</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(false, null)}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
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
            className="text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
          >
            重置
          </button>
        </div>
      </section>

      {err && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-2 rounded-md whitespace-pre-wrap break-all">
          {err}
        </p>
      )}

      <section className="rounded-xl border border-border bg-card shadow-xs overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="p-2 whitespace-nowrap">時間</th>
              <th className="p-2 whitespace-nowrap">操作者</th>
              <th className="p-2 whitespace-nowrap">動作</th>
              <th className="p-2">對象</th>
              <th className="p-2">摘要</th>
              <th className="p-2 whitespace-nowrap">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                  {loading ? "讀取中…" : "查無紀錄。"}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const userOpt = r.userId ? userById.get(r.userId) : null;
                const display =
                  r.userName ||
                  userOpt?.name ||
                  r.username ||
                  userOpt?.username ||
                  "（已刪除）";
                const userLine = r.username || userOpt?.username;
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="p-2 whitespace-nowrap text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <div className="font-medium">{display}</div>
                      {userLine && (
                        <div className="font-mono text-xs text-muted-foreground">
                          {userLine}
                        </div>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs">
                      {AUDIT_ACTION_LABEL[r.action as AuditAction] ?? r.action}
                    </td>
                    <td className="p-2 text-xs">
                      {r.targetType && (
                        <div className="text-muted-foreground">{r.targetType}</div>
                      )}
                      {r.targetLabel && <div>{r.targetLabel}</div>}
                    </td>
                    <td className="p-2 text-xs whitespace-pre-wrap break-all">
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
                    <td className="p-2 whitespace-nowrap text-[11px] text-muted-foreground font-mono">
                      {r.ip || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <div className="flex justify-center">
        {nextCursor ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(true, nextCursor)}
            className="text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
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
