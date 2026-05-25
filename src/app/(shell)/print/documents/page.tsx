/**
 * 批次列印單據
 * 檔案：src/app/(shell)/print/documents/page.tsx
 */

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

type PrintBlock = {
  companyName: string;
  companyPhone: string | null;
  companyAddress: string | null;
};

type ChannelStore = {
  channelCode: string;
  name: string | null;
  phone: string | null;
  address: string | null;
};

type PrintPayload = {
  printHeader: PrintBlock | null;
  docs: Array<{
    id: string;
    documentNumber: string;
    documentType: string;
    flow: "OUT" | "IN";
    documentDate: string | null;
    createdAt: string;
    counterpartyName: string | null;
    channelCode: string | null;
    channelStore: ChannelStore | null;
    departmentId: string;
    department: { name: string };
    picker: { username: string } | null;
    inspector: { username: string } | null;
    lines: Array<{
      id: string;
      productCode: string;
      barcode: string | null;
      productName: string;
      docQuantity: number;
      inspectQuantity: number;
      remark: string | null;
    }>;
  }>;
};

const DEFAULT_COPIES = ["客戶聯", "倉儲聯", "業務財務聯"] as const;

function PrintInner() {
  const sp = useSearchParams();
  const ids = sp.get("ids")?.split(",").filter(Boolean) ?? [];
  const idsKey = ids.join(",");
  const [data, setData] = useState<PrintPayload | null>(null);

  const applyPrintLayout = useCallback(() => {
    const pages = Array.from(
      document.querySelectorAll<HTMLElement>(".print-page"),
    );
    if (pages.length === 0) return;

    const mmToPx = 96 / 25.4;
    const printableWidthPx = (210 - 20) * mmToPx;
    const printableHeightPx = (297 - 20) * mmToPx;

    const measure = document.createElement("span");
    measure.setAttribute("aria-hidden", "true");
    measure.className = "print-name-measure";
    document.body.appendChild(measure);

    try {
      for (const page of pages) {
        const nameCol = page.querySelector<HTMLTableColElement>("col.print-col-name");
        let maxNamePx = 0;
        for (const cell of page.querySelectorAll<HTMLElement>(
          "th.print-col-name, td.print-col-name",
        )) {
          measure.textContent = cell.textContent?.trim() ?? "";
          maxNamePx = Math.max(maxNamePx, measure.offsetWidth);
        }
        if (nameCol && maxNamePx > 0) {
          nameCol.style.width = `${Math.ceil(maxNamePx + 16)}px`;
        }

        page.style.setProperty("--print-scale", "1");
        const width = page.scrollWidth;
        const height = page.scrollHeight;
        if (!width || !height) continue;

        const fitScale = Math.min(
          1,
          printableWidthPx / width,
          printableHeightPx / height,
        );
        page.style.setProperty("--print-scale", Math.max(0.28, fitScale).toFixed(3));
      }
    } finally {
      measure.remove();
    }
  }, []);

  useEffect(() => {
    if (ids.length === 0) return;
    void (async () => {
      const res = await fetch(
        `/api/documents/print-data?ids=${idsKey}`,
        { credentials: "include" },
      );
      if (res.ok) setData(await res.json());
    })();
  }, [ids.length, idsKey]);

  useEffect(() => {
    document.body.classList.add("print-documents-mode");
    return () => {
      document.body.classList.remove("print-documents-mode");
    };
  }, []);

  useEffect(() => {
    if (!data) return;

    const run = () => applyPrintLayout();
    const t0 = window.setTimeout(run, 0);
    const t1 = window.setTimeout(run, 120);
    window.addEventListener("beforeprint", run);
    window.addEventListener("resize", run);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.removeEventListener("beforeprint", run);
      window.removeEventListener("resize", run);
    };
  }, [data, applyPrintLayout]);

  if (ids.length === 0) {
    return (
      <p className="text-muted-foreground">
        請從單據列表勾選後開啟「批次列印選取」，或手動在網址加上
        ?ids=id1,id2
      </p>
    );
  }
  if (!data) return <p>載入中…</p>;

  return (
    <div className="print-docs space-y-6">
      <div className="flex gap-4 no-print">
        <button
          type="button"
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm shadow hover:bg-primary/90"
          onClick={() => window.print()}
        >
          列印
        </button>
      </div>

      {data.docs.flatMap((d) => {
        const ps = data.printHeader;
        const flowLabel = d.flow === "IN" ? "驗入" : "驗出";
        return DEFAULT_COPIES.map((copyLabel) => (
          <div
            key={`${d.id}-${copyLabel}`}
            className="print-page break-after-page border border-border p-2 bg-card text-card-foreground"
          >
            <table className="text-sm border border-border print-table">
              <colgroup>
                <col className="print-col-code" />
                <col className="print-col-barcode" />
                <col className="print-col-name" />
                <col className="print-col-qty" />
                <col className="print-col-qty" />
                <col className="print-col-remark" />
              </colgroup>
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th colSpan={6} className="print-doc-header-cell">
                    <div className="print-copy-label">{copyLabel}</div>
                    {ps && (
                      <div className="text-center border-b border-border pb-4 mb-4 print-company">
                        <div className="text-xl font-bold">{ps.companyName}</div>
                        <div className="text-sm text-muted-foreground">
                          {ps.companyPhone} {ps.companyAddress}
                        </div>
                      </div>
                    )}
                    <h2 className="text-lg font-semibold mb-2 print-title">
                      {flowLabel}／驗收單
                    </h2>
                    <div className="text-sm grid grid-cols-2 gap-2 mb-3 print-meta">
                      <div>單據號碼：{d.documentNumber}</div>
                      <div>類型：{d.documentType}</div>
                      <div>部門：{d.department.name}</div>
                      <div>
                        單據日期：
                        {new Date(d.documentDate ?? d.createdAt).toLocaleDateString(
                          "zh-TW",
                          {
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                          },
                        )}
                      </div>
                      {d.flow === "IN" ? (
                        <div>檢驗者：{d.inspector?.username ?? "—"}</div>
                      ) : (
                        <>
                          <div>揀貨者：{d.picker?.username ?? "—"}</div>
                          <div>驗收者：{d.inspector?.username ?? "—"}</div>
                        </>
                      )}
                      <div className="col-span-2">客戶：{d.counterpartyName}</div>
                    </div>
                    <div className="text-sm border border-border rounded-md p-3 mb-4 bg-muted/60 print-store">
                      <div className="font-medium text-foreground mb-2">門市資料（通路主檔）</div>
                      {d.channelStore ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          <div>通路代碼：{d.channelStore.channelCode}</div>
                          <div>名稱：{d.channelStore.name ?? "—"}</div>
                          <div>電話：{d.channelStore.phone ?? "—"}</div>
                          <div className="sm:col-span-2">
                            地址：{d.channelStore.address ?? "—"}
                          </div>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">單據未填通路代碼</div>
                      )}
                    </div>
                  </th>
                </tr>
                <tr>
                  <th className="border p-1 text-left print-col-code">貨號</th>
                  <th className="border p-1 text-left print-col-barcode">條碼</th>
                  <th className="border p-1 text-left print-col-name">品名</th>
                  <th className="border p-1 text-right print-col-qty">單據量</th>
                  <th className="border p-1 text-right print-col-qty">驗收量</th>
                  <th className="border p-1 text-left print-col-remark">備註</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="border p-1 print-col-code">{l.productCode}</td>
                    <td className="border p-1 font-mono text-xs print-col-barcode">{l.barcode}</td>
                    <td className="border p-1 print-col-name">{l.productName}</td>
                    <td className="border p-1 text-right print-col-qty">{l.docQuantity}</td>
                    <td className="border p-1 text-right print-col-qty">{l.inspectQuantity}</td>
                    <td className="border p-1 print-col-remark">{l.remark ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ));
      })}

      <style jsx global>{`
        .print-name-measure {
          position: fixed;
          left: -9999px;
          top: 0;
          visibility: hidden;
          white-space: nowrap;
          font-size: 12px;
          line-height: 1.3;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }

        .print-page {
          zoom: var(--print-scale, 1);
          transform-origin: top left;
        }

        .print-table {
          table-layout: auto;
          width: max-content;
          min-width: 100%;
        }

        .print-col-code,
        .print-table .print-col-code {
          white-space: nowrap;
          font-size: 10px;
        }

        .print-col-barcode,
        .print-table .print-col-barcode {
          white-space: nowrap;
          font-size: 10px;
        }

        .print-col-name,
        .print-table .print-col-name {
          white-space: nowrap !important;
          word-break: keep-all !important;
        }

        .print-col-qty,
        .print-table .print-col-qty {
          width: 1%;
          white-space: nowrap;
          text-align: right;
        }

        .print-col-remark,
        .print-table .print-col-remark {
          width: 1%;
          white-space: nowrap;
        }

        .print-company {
          padding-bottom: 6px !important;
          margin-bottom: 6px !important;
        }

        .print-title {
          margin-bottom: 4px !important;
        }

        .print-meta {
          margin-bottom: 4px !important;
        }

        .print-store {
          margin-bottom: 4px !important;
          padding: 6px 8px !important;
        }

        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          body.print-documents-mode * {
            visibility: hidden !important;
          }

          body.print-documents-mode .print-docs,
          body.print-documents-mode .print-docs * {
            visibility: visible !important;
          }

          body.print-documents-mode .print-docs {
            position: absolute !important;
            inset: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }

          .no-print {
            display: none !important;
          }

          body {
            background: white;
          }

          .print-docs {
            gap: 0 !important;
            font-size: 12px !important;
            color: #111827 !important;
          }

          .print-page {
            border: none !important;
            background: white !important;
            color: #111827 !important;
            padding: 0 !important;
            margin: 0 !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
            position: relative !important;
          }

          .print-page:last-child {
            break-after: auto;
          }

          .print-copy-label {
            position: absolute !important;
            top: 0 !important;
            right: 0 !important;
            padding: 4px 8px !important;
            border: 1px solid #9ca3af !important;
            color: #111827 !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            background: white !important;
          }

          .print-title {
            font-size: 18px !important;
            margin-bottom: 4px !important;
          }

          .print-meta {
            gap: 2px !important;
            margin-bottom: 4px !important;
          }

          .print-store {
            border-radius: 0 !important;
            background: white !important;
          }

          .print-table {
            border-collapse: collapse !important;
            width: max-content !important;
            min-width: 100% !important;
            table-layout: auto !important;
          }

          .print-table thead {
            background: white !important;
            color: #111827 !important;
            display: table-header-group !important;
          }

          .print-table thead tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .print-doc-header-cell {
            border: none !important;
            background: white !important;
            color: #111827 !important;
            padding: 0 0 4px 0 !important;
            text-align: left !important;
            font-weight: 400 !important;
          }

          .print-company {
            text-align: center !important;
          }

          .print-table tbody {
            display: table-row-group !important;
          }

          .print-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .print-table th,
          .print-table td {
            border: 1px solid #9ca3af !important;
            padding: 2px 4px !important;
            line-height: 1.3 !important;
            vertical-align: middle !important;
          }

        }
      `}</style>
    </div>
  );
}

export default function PrintDocumentsPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <PrintInner />
    </Suspense>
  );
}
