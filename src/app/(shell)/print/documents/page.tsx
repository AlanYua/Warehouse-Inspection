/**
 * 批次列印單據
 * 檔案：src/app/(shell)/print/documents/page.tsx
 */

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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

type PrintDoc = {
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
};

type PrintPayload = {
  printHeader: PrintBlock | null;
  docs: PrintDoc[];
};

/** 含表頭時約可塞進半張 A4（A5）的明細列數 */
const A5_LINE_THRESHOLD = 8;

function formatDocDate(documentDate: string | null, createdAt: string) {
  return new Date(documentDate ?? createdAt).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function docFitsA5(lineCount: number) {
  return lineCount <= A5_LINE_THRESHOLD;
}

/** 列印單別：依 flow 顯示入庫／出貨單 */
function getSheetTypeLabel(d: PrintDoc): string {
  return d.flow === "OUT" ? "出貨單(驗出)" : "入庫單(驗入)";
}

function DocumentSheet({
  d,
  printHeader,
  copyLabel,
  className = "",
}: {
  d: PrintDoc;
  printHeader: PrintBlock | null;
  copyLabel: string;
  className?: string;
}) {
  const sheetType = getSheetTypeLabel(d);
  const dateStr = formatDocDate(d.documentDate, d.createdAt);

  return (
    <section className={`print-sheet ${className}`.trim()}>
      {printHeader && (
        <div className="text-center border-b border-border pb-2 mb-2 print-company">
          <div className="text-lg font-bold">{printHeader.companyName}</div>
          <div className="text-xs text-muted-foreground">
            {[printHeader.companyPhone, printHeader.companyAddress]
              .filter(Boolean)
              .join("　")}
          </div>
        </div>
      )}

      <div className="print-sheet-head">
        <div className="print-sheet-type">
          <span className="print-sheet-type-label">單別</span>
          <h2 className="print-title">{sheetType}</h2>
        </div>
        <div className="print-copy-label">{copyLabel}</div>
      </div>

      <div className="print-info-row">
        <div className="print-doc-info">
          <div className="print-info-heading">單據資料</div>
          <div>單據號碼：{d.documentNumber}</div>
          <div>單據類型：{d.documentType}</div>
          <div>部門：{d.department.name}</div>
          <div>單據日期：{dateStr}</div>
          <div>客戶：{d.counterpartyName ?? "—"}</div>
          {d.flow === "IN" ? (
            <div>檢驗者：{d.inspector?.username ?? "—"}</div>
          ) : (
            <>
              <div>揀貨者：{d.picker?.username ?? "—"}</div>
              <div>驗收者：{d.inspector?.username ?? "—"}</div>
            </>
          )}
        </div>

        <div className="print-store-info">
          <div className="print-info-heading">門市資料</div>
          {d.channelStore ? (
            <>
              <div>通路代碼：{d.channelStore.channelCode}</div>
              <div>名稱：{d.channelStore.name ?? "—"}</div>
              <div>電話：{d.channelStore.phone ?? "—"}</div>
              <div>地址：{d.channelStore.address ?? "—"}</div>
            </>
          ) : (
            <div className="text-muted-foreground">單據未填通路代碼</div>
          )}
        </div>
      </div>

      <table className="w-full text-sm border border-border print-table print-lines-table">
        <colgroup>
          <col style={{ width: "13%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "42%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "11%" }} />
        </colgroup>
        <thead>
          <tr className="bg-muted text-muted-foreground">
            <th className="border p-1 text-left">貨號</th>
            <th className="border p-1 text-left">條碼</th>
            <th className="border p-1 text-left">品名</th>
            <th className="border p-1 text-right">單據量</th>
            <th className="border p-1 text-right">驗收量</th>
            <th className="border p-1 text-left">備註</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id}>
              <td className="border p-1 print-td-code">{l.productCode}</td>
              <td className="border p-1 print-td-barcode">{l.barcode}</td>
              <td className="border p-1 print-td-name">{l.productName}</td>
              <td className="border p-1 text-right">{l.docQuantity}</td>
              <td className="border p-1 text-right">{l.inspectQuantity}</td>
              <td className="border p-1 print-td-remark">{l.remark ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 明細少：客戶聯 A5；倉儲＋業務財務合印一張 A4。明細多：三聯各一張 A4 */
function renderDocPages(d: PrintDoc, printHeader: PrintBlock | null) {
  const compact = docFitsA5(d.lines.length);
  const ps = printHeader;
  const pageShell =
    "print-page break-after-page border border-border p-4 bg-card text-card-foreground";

  if (compact) {
    return (
      <>
        <div
          key={`${d.id}-customer`}
          className={`${pageShell} print-page-a5`}
        >
          <DocumentSheet d={d} printHeader={ps} copyLabel="客戶聯" />
        </div>
        <div
          key={`${d.id}-warehouse-biz`}
          className={`${pageShell} print-page-a4 print-dual-a5`}
        >
          <DocumentSheet
            d={d}
            printHeader={ps}
            copyLabel="倉儲聯"
            className="print-a5-half"
          />
          <DocumentSheet
            d={d}
            printHeader={ps}
            copyLabel="業務財務聯"
            className="print-a5-half"
          />
        </div>
      </>
    );
  }

  return (["客戶聯", "倉儲聯", "業務財務聯"] as const).map((copyLabel) => (
    <div
      key={`${d.id}-${copyLabel}`}
      className={`${pageShell} print-page-a4`}
    >
      <DocumentSheet d={d} printHeader={ps} copyLabel={copyLabel} />
    </div>
  ));
}

function PrintInner() {
  const sp = useSearchParams();
  const ids = sp.get("ids")?.split(",").filter(Boolean) ?? [];
  const idsKey = ids.join(",");
  const [data, setData] = useState<PrintPayload | null>(null);

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
    const stripBrowserPrintChrome = () => {
      document.title = "\u00a0";
    };
    const restoreTitle = () => {
      document.title = "列印單據";
    };
    window.addEventListener("beforeprint", stripBrowserPrintChrome);
    window.addEventListener("afterprint", restoreTitle);
    return () => {
      document.body.classList.remove("print-documents-mode");
      window.removeEventListener("beforeprint", stripBrowserPrintChrome);
      window.removeEventListener("afterprint", restoreTitle);
    };
  }, []);

  const handlePrint = () => {
    document.title = "\u00a0";
    window.print();
  };

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
      <div className="flex flex-col gap-2 no-print">
        <button
          type="button"
          className="self-start px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm shadow hover:bg-primary/90"
          onClick={handlePrint}
        >
          列印
        </button>
        <p className="text-xs text-muted-foreground max-w-xl">
          列印前請在瀏覽器列印設定<strong>取消勾選「頁首及頁尾」</strong>
          （Chrome／Edge：更多設定 → 頁首及頁尾），才不會印出網址、系統名稱、日期與頁碼。
          明細 ≤{A5_LINE_THRESHOLD} 筆：客戶聯 A5、倉儲與業務財務合印一張 A4；超過則三聯各一張 A4。
        </p>
      </div>

      {data.docs.flatMap((d) => renderDocPages(d, data.printHeader))}

      <style jsx global>{`
        .print-sheet {
          position: relative;
        }

        .print-sheet-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }

        .print-sheet-type {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }

        .print-sheet-type-label {
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
        }

        .print-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .print-copy-label {
          flex-shrink: 0;
          padding: 4px 8px;
          border: 1px solid #9ca3af;
          font-size: 12px;
          font-weight: 600;
        }

        .print-info-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 10px;
          font-size: 13px;
          line-height: 1.45;
        }

        .print-info-heading {
          font-weight: 600;
          margin-bottom: 4px;
          color: inherit;
        }

        .print-doc-info,
        .print-store-info {
          border: 1px solid #d1d5db;
          border-radius: 4px;
          padding: 8px 10px;
        }

        .print-table {
          table-layout: fixed;
          width: 100%;
          border-collapse: collapse;
        }

        .print-table th,
        .print-table td {
          border: 1px solid #9ca3af;
          padding: 4px 6px;
          line-height: 1.35;
          vertical-align: top;
          overflow-wrap: break-word;
          word-break: break-word;
        }

        .print-td-code,
        .print-td-barcode {
          font-size: 11px;
        }

        .print-td-barcode {
          font-family: ui-monospace, monospace;
        }

        .print-td-name {
          font-size: 12px;
          line-height: 1.4;
        }

        .print-td-remark {
          font-size: 11px;
        }

        @media print {
          @page a4 {
            size: A4 portrait;
            margin: 10mm;
          }

          @page a5 {
            size: A5 portrait;
            margin: 10mm;
          }

          .print-page-a4 {
            page: a4;
          }

          .print-page-a5 {
            page: a5;
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
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            position: relative !important;
          }

          .print-page:last-child {
            break-after: auto;
          }

          .print-dual-a5 {
            display: flex !important;
            flex-direction: column !important;
            min-height: 0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .print-a5-half {
            flex: 0 0 auto !important;
            max-height: 138mm !important;
            overflow: hidden !important;
            padding-bottom: 4mm !important;
            box-sizing: border-box !important;
          }

          .print-a5-half + .print-a5-half {
            border-top: 1px dashed #6b7280 !important;
            padding-top: 4mm !important;
            margin-top: 2mm !important;
          }

          .print-copy-label {
            border: 1px solid #9ca3af !important;
            color: #111827 !important;
            background: white !important;
          }

          .print-sheet-type-label {
            color: #6b7280 !important;
          }

          .print-title {
            font-size: 18px !important;
            color: #111827 !important;
          }

          .print-company {
            text-align: center !important;
            color: #111827 !important;
          }

          .print-doc-info,
          .print-store-info {
            border-radius: 0 !important;
            background: white !important;
            color: #111827 !important;
          }

          .print-info-heading {
            color: #111827 !important;
          }

          .print-lines-table thead {
            background: white !important;
            color: #111827 !important;
            display: table-header-group !important;
          }

          .print-lines-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
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
