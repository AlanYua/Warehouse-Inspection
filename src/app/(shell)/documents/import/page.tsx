/**
 * 單據 Excel 匯入頁
 * 檔案：src/app/(shell)/documents/import/page.tsx
 */

"use client";

import Link from "next/link";
import {
  ListCard,
  MobileList,
  Page,
  PageHeader,
  Panel,
  PanelBody,
  TableShell,
} from "@/components/ui/page-shell";
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
    <Page>
      <PageHeader
        title="Excel 匯入"
        description="必填：單據類型、單據日期、單據號碼、通路代碼、貨品編號或國際條碼（至少一項）、單據數量、部門（須與該通路代碼在通路主檔的部門一致）。選填：備註；製單者未填時預設為目前登入者。"
      />
      <Panel>
        <PanelBody className="space-y-4">
          <div className="toolbar flex-wrap">
            <label className="btn-secondary cursor-pointer">
              {loading ? "上傳中…" : "選擇 Excel"}
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={loading}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </label>
            <Link
              href="/api/import/template/documents"
              prefetch={false}
              className="btn-secondary"
            >
              下載範本
            </Link>
          </div>
          {msg && <p className="text-sm whitespace-pre-line">{msg}</p>}

          {details.length > 0 && (
            <>
              <MobileList>
                {details.map((d, i) => (
                  <ListCard key={i}>
                    <div className="font-mono text-sm font-medium">{d.documentNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.documentType} · {d.channelCode || "—"}
                    </div>
                    <div className={`text-sm ${STATUS_CLASS[d.status]}`}>
                      {STATUS_LABEL[d.status]}
                      {d.reason ? `：${d.reason}` : ""}
                    </div>
                  </ListCard>
                ))}
              </MobileList>
              <TableShell>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>單據號碼</th>
                      <th>單據類型</th>
                      <th>通路代碼</th>
                      <th>狀況</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d, i) => (
                      <tr key={i}>
                        <td className="font-mono">{d.documentNumber}</td>
                        <td>{d.documentType}</td>
                        <td className="font-mono">{d.channelCode || "—"}</td>
                        <td className={STATUS_CLASS[d.status]}>
                          {STATUS_LABEL[d.status]}
                          {d.reason ? `：${d.reason}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            </>
          )}
        </PanelBody>
      </Panel>

      {extraErrors.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-red-600">
          {extraErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </Page>
  );
}
