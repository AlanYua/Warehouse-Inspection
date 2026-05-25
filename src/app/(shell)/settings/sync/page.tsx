/**
 * 匯入紀錄
 * 檔案：src/app/(shell)/settings/sync/page.tsx
 */

"use client";

import { useEffect, useState } from "react";

type Log = {
  id: string;
  filename: string | null;
  source: string;
  orderNo: string | null;
  successCount: number;
  errorCount: number;
  message: string | null;
  uploader: string | null;
  createdAt: string;
};

export default function SyncSettingsPage() {
  const [logs, setLogs] = useState<Log[]>([]);

  async function loadLogs() {
    const res = await fetch("/api/import/logs", { credentials: "include" });
    if (res.ok) setLogs(await res.json());
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadLogs();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="page max-w-3xl">
      <header className="page-header space-y-1">
        <h1 className="page-title">匯入紀錄</h1>
        <p className="page-desc">
          顯示最近的 Excel 匯入紀錄，用來追查匯入成功/失敗原因（不含背景 DB 同步）。
        </p>
      </header>
      <div>
        <h2 className="font-medium text-foreground mb-2">最近匯入紀錄</h2>
        {/* Mobile cards */}
        <div className="mobile-list">
          {logs.map((l) => (
            <div key={l.id} className="list-card">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs font-medium">{l.source}</span>
                <span className="text-[11px] text-muted-foreground shrink-0" suppressHydrationWarning>
                  {new Date(l.createdAt).toLocaleString()}
                </span>
              </div>
              {l.filename && (
                <div className="text-xs text-muted-foreground truncate">{l.filename}</div>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <span className="text-green-700">成功 <strong className="tabular-nums">{l.successCount}</strong></span>
                <span className={l.errorCount > 0 ? "text-red-600" : "text-muted-foreground"}>
                  失敗 <strong className="tabular-nums">{l.errorCount}</strong>
                </span>
                {l.uploader && <span className="text-muted-foreground">{l.uploader}</span>}
              </div>
              {l.message && (
                <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                  {l.message.slice(0, 300)}
                </div>
              )}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">尚無紀錄</p>
          )}
        </div>
        {/* Desktop table */}
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-2 whitespace-nowrap">時間</th>
                <th className="p-2">來源</th>
                <th className="p-2">檔名</th>
                <th className="p-2 whitespace-nowrap">成功</th>
                <th className="p-2 whitespace-nowrap">失敗</th>
                <th className="p-2">訊息</th>
                <th className="p-2 whitespace-nowrap">上傳者</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap text-xs" suppressHydrationWarning>
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2 font-mono text-xs">{l.source}</td>
                  <td className="p-2 text-xs">{l.filename ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{l.successCount}</td>
                  <td className="p-2 text-right tabular-nums">{l.errorCount}</td>
                  <td className="p-2 text-xs whitespace-pre-wrap">
                    {l.message ? l.message.slice(0, 300) : "—"}
                  </td>
                  <td className="p-2 text-xs">{l.uploader ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={7}>
                    尚無紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
