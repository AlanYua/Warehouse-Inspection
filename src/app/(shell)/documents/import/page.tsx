/**
 * 單據 Excel 匯入頁
 * 檔案：src/app/(shell)/documents/import/page.tsx
 */

"use client";

import Link from "next/link";
import { useState } from "react";

type ImportDetail = {
  documentNumber: string;
  documentType: string;
  channelCode: string;
  status: "CREATED" | "OVERWRITTEN" | "ERROR";
  reason?: string;
};

const STATUS_LABEL: Record<ImportDetail["status"], string> = {
  CREATED: "成功",
  OVERWRITTEN: "覆蓋原有",
  ERROR: "錯誤",
};

const STATUS_CLASS: Record<ImportDetail["status"], string> = {
  CREATED: "text-green-600",
  OVERWRITTEN: "text-amber-600",
  ERROR: "text-red-600",
};

export default function ImportExcelPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<ImportDetail[]>([]);
  const [extraErrors, setExtraErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function onFile(f: File) {
    setLoading(true);
    setMsg(null);
    setDetails([]);
    setExtraErrors([]);
    const fd = new FormData();
    fd.set("file", f);
    const res = await fetch("/api/import/excel", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    setLoading(false);
    const j = await res.json().catch(() => ({}));
    const detailList: ImportDetail[] = Array.isArray(j.details) ? j.details : [];
    const errList: string[] = Array.isArray(j.errors) ? j.errors : [];

    if (!res.ok) {
      setMsg(j.error ?? res.statusText);
      setDetails(detailList);
      // 若沒有 details，退回原本錯誤字串列表，避免使用者看不到原因
      if (detailList.length === 0) setExtraErrors(errList);
      return;
    }

    const created = j.created ?? 0;
    const updated = j.updated ?? 0;
    const overwritten = j.overwritten ?? 0;
    const errCount = j.errorCount ?? errList.length ?? 0;
    setMsg(
      `新增 ${created}，更新 ${updated}，覆蓋原有 ${overwritten}，錯誤 ${errCount} 筆`,
    );
    setDetails(detailList);
    // applyExternalRows 階段的錯誤如未對應到 details，補一份原始字串
    const detailKeys = new Set(
      detailList.map(
        (d) => `${d.documentNumber}\u0001${d.documentType}\u0001${d.channelCode}`,
      ),
    );
    if (errList.length > 0 && detailKeys.size === 0) {
      setExtraErrors(errList);
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Excel 匯入
      </h1>
      <p className="text-sm text-muted-foreground">
        必填：單據類型、單據日期、單據號碼、通路代碼、貨品編號或國際條碼（至少一項）、單據數量、部門（須與該通路代碼在通路主檔的部門一致）。
        選填：備註（未填或欄位不存在時為空）製單者未填時（預設為目前登入者）。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <Link
          href="/api/import/template/documents"
          prefetch={false}
          className="text-sm rounded-md border border-input bg-secondary/60 px-3 py-1.5 text-secondary-foreground hover:bg-secondary"
        >
          下載範本
        </Link>
      </div>
      {loading && <p className="text-sm">上傳中…</p>}
      {msg && <p className="text-sm whitespace-pre-line">{msg}</p>}

      {details.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">單據號碼</th>
                <th className="px-3 py-2 text-left font-medium">單據類型</th>
                <th className="px-3 py-2 text-left font-medium">通路代碼</th>
                <th className="px-3 py-2 text-left font-medium">狀況</th>
              </tr>
            </thead>
            <tbody>
              {details.map((d, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">{d.documentNumber}</td>
                  <td className="px-3 py-2">{d.documentType}</td>
                  <td className="px-3 py-2 font-mono">
                    {d.channelCode || "—"}
                  </td>
                  <td className={`px-3 py-2 ${STATUS_CLASS[d.status]}`}>
                    {STATUS_LABEL[d.status]}
                    {d.reason ? `：${d.reason}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {extraErrors.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-red-600">
          {extraErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
