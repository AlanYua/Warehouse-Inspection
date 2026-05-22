"use client";

import { useEffect, useRef, useState } from "react";
import { flowZh } from "@/app/(shell)/documents/[id]/inspect-types";

type HistoryRow = {
  lineId: string;
  flow: "OUT" | "IN";
  documentType: string;
  documentNumber: string;
  counterpartyName: string | null;
  departmentName: string;
  eventAt: string;
  statusLabel: string;
  docQuantity: number;
  inspectQuantity: number;
};

type Payload = {
  product: {
    productCode: string;
    name: string;
    barcode: string | null;
  } | null;
  summary: {
    purchaseQty: number;
    salesQty: number;
    customerReturnQty: number;
    vendorReturnQty: number;
    netStock: number;
  };
  total: number;
  rows: HistoryRow[];
};

type BrandOption = { id: string; name: string; isActive: boolean };

type ProductOption = {
  productCode: string;
  name: string;
  barcode: string | null;
  brand: string | null;
};

const inputCls =
  "mt-0.5 block rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtAbs(n: number) {
  const a = Math.abs(n);
  return Number.isInteger(a) ? String(a) : a.toFixed(2).replace(/\.?0+$/, "");
}

function fmtSignedQty(n: number) {
  if (n === 0) return "0";
  const s = fmtAbs(n);
  return n > 0 ? `+${s}` : `-${s}`;
}

function qtyClass(n: number) {
  if (n > 0) return "text-emerald-700 dark:text-emerald-400";
  if (n < 0) return "text-orange-700 dark:text-orange-400";
  return "";
}

export default function ShippingHistoryClient() {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brand, setBrand] = useState("");
  const [keyword, setKeyword] = useState("");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [flow, setFlow] = useState<"" | "OUT" | "IN">("");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const activeBrands = brands.filter((b) => b.isActive);

  useEffect(() => {
    void fetch("/api/brands", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: BrandOption[]) => setBrands(Array.isArray(rows) ? rows : []));
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pickerOpen]);

  useEffect(() => {
    const k = keyword.trim();
    if (!brand || !k) {
      setProductOptions([]);
      setOptionsLoading(false);
      return;
    }

    const t = window.setTimeout(() => {
      void (async () => {
        setOptionsLoading(true);
        try {
          const sp = new URLSearchParams({ brand, q: k, limit: "30" });
          const res = await fetch(`/api/products?${sp}`, { credentials: "include" });
          const j = await res.json().catch(() => []);
          if (!res.ok) {
            setProductOptions([]);
            return;
          }
          const opts: ProductOption[] = Array.isArray(j) ? j : [];
          setProductOptions(opts);
          setPickerOpen(true);
          if (opts.length === 1) {
            const p = opts[0];
            const kn = k.toLowerCase();
            if (
              p.productCode.toLowerCase() === kn ||
              (p.barcode && p.barcode.toLowerCase() === kn)
            ) {
              setSelectedProduct(p);
              setKeyword(`${p.productCode} · ${p.name}`);
              setPickerOpen(false);
            }
          }
        } finally {
          setOptionsLoading(false);
        }
      })();
    }, 280);

    return () => window.clearTimeout(t);
  }, [brand, keyword]);

  function onBrandChange(next: string) {
    setBrand(next);
    setKeyword("");
    setSelectedProduct(null);
    setProductOptions([]);
    setPickerOpen(false);
    setData(null);
    setErr(null);
  }

  function pickProduct(p: ProductOption) {
    setSelectedProduct(p);
    setKeyword(`${p.productCode} · ${p.name}`);
    setPickerOpen(false);
    setData(null);
    setErr(null);
  }

  function onKeywordChange(v: string) {
    setKeyword(v);
    if (
      selectedProduct &&
      v.trim() !== `${selectedProduct.productCode} · ${selectedProduct.name}`
    ) {
      setSelectedProduct(null);
      setData(null);
    }
  }

  async function search() {
    if (!brand) {
      setErr("請先選擇品牌");
      setData(null);
      return;
    }
    if (!selectedProduct) {
      setErr("請先從品項清單選擇商品");
      setData(null);
      return;
    }
    const q = selectedProduct.productCode.trim();
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams({ q });
      if (dateFrom) sp.set("dateFrom", dateFrom);
      if (dateTo) sp.set("dateTo", dateTo);
      if (flow) sp.set("flow", flow);
      const res = await fetch(`/api/reports/shipping-history?${sp}`, {
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : `查詢失敗（${res.status}）`);
        setData(null);
        return;
      }
      setData(j as Payload);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            出貨歷史紀錄
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            僅供查詢檢視，無法編輯。僅含已出貨／已入庫單據；入庫為正（+）、出貨為負（-）
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div>
            <label className="block text-xs text-muted-foreground">品牌</label>
            <select
              className={`${inputCls} w-40`}
              value={brand}
              onChange={(e) => onBrandChange(e.target.value)}
              disabled={!activeBrands.length}
            >
              <option value="">請選擇</option>
              {activeBrands.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="relative" ref={pickerRef}>
            <label className="block text-xs text-muted-foreground">
              品項（貨號／條碼／名稱）
            </label>
            <input
              type="text"
              className={`${inputCls} w-72`}
              placeholder={brand ? "輸入關鍵字搜尋品項" : "請先選品牌"}
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              onFocus={() => {
                if (productOptions.length) setPickerOpen(true);
              }}
              disabled={!brand}
            />
            {brand && keyword.trim() && pickerOpen ? (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md text-sm">
                {optionsLoading ? (
                  <li className="px-3 py-2 text-muted-foreground">搜尋中…</li>
                ) : productOptions.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">無符合品項</li>
                ) : (
                  productOptions.map((p) => (
                    <li key={p.productCode}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                        onClick={() => pickProduct(p)}
                      >
                        <span className="font-mono font-medium">{p.productCode}</span>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span>{p.name}</span>
                        {p.barcode ? (
                          <span className="block text-xs text-muted-foreground font-mono mt-0.5">
                            {p.barcode}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">起日</label>
            <input
              type="date"
              className={inputCls}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">迄日</label>
            <input
              type="date"
              className={inputCls}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">方向</label>
            <select
              className={inputCls}
              value={flow}
              onChange={(e) => setFlow(e.target.value as "" | "OUT" | "IN")}
            >
              <option value="">全部</option>
              <option value="OUT">驗出</option>
              <option value="IN">驗入</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading || !selectedProduct}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "查詢中…" : "查詢"}
          </button>
        </form>
        {selectedProduct ? (
          <p className="text-xs text-muted-foreground">
            已選：
            <span className="font-mono text-foreground ml-1">
              {selectedProduct.productCode}
            </span>
            <span className="mx-1">·</span>
            {selectedProduct.name}
            {selectedProduct.barcode ? (
              <span className="font-mono ml-2">{selectedProduct.barcode}</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {err ? (
        <pre className="text-xs bg-muted text-muted-foreground p-2 rounded-md overflow-auto border border-border">
          {err}
        </pre>
      ) : null}

      {data?.product ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">貨號 </span>
            <span className="font-mono font-medium">{data.product.productCode}</span>
          </div>
          <div>{data.product.name}</div>
          {data.product.barcode ? (
            <div>
              <span className="text-muted-foreground">條碼 </span>
              <span className="font-mono">{data.product.barcode}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>
            進貨量{" "}
            <strong className="tabular-nums text-foreground">
              {fmtAbs(data.summary.purchaseQty)}
            </strong>
          </span>
          <span>
            銷貨量{" "}
            <strong className="tabular-nums text-foreground">
              {fmtAbs(data.summary.salesQty)}
            </strong>
          </span>
          <span>
            客戶退貨量{" "}
            <strong className="tabular-nums text-foreground">
              {fmtAbs(data.summary.customerReturnQty)}
            </strong>
          </span>
          <span>
            廠商退貨量{" "}
            <strong className="tabular-nums text-foreground">
              {fmtAbs(data.summary.vendorReturnQty)}
            </strong>
          </span>
          <span>
            淨庫存{" "}
            <strong className={`tabular-nums ${qtyClass(data.summary.netStock)}`}>
              {fmtSignedQty(data.summary.netStock)}
            </strong>
          </span>
          <span>總筆數 {data.total}</span>
        </div>
      ) : null}

      {data && data.rows.length === 0 && !loading ? (
        <p className="text-muted-foreground">查無紀錄</p>
      ) : null}

      {data && data.rows.length > 0 ? (
        <>
          <div className="md:hidden space-y-2">
            {data.rows.map((r) => (
              <div
                key={r.lineId}
                className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={
                      r.flow === "OUT"
                        ? "text-xs font-medium text-orange-700 dark:text-orange-400"
                        : "text-xs font-medium text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {flowZh[r.flow]}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.eventAt)}</span>
                </div>
                <div className="font-mono text-sm font-medium">{r.documentNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {r.documentType} · {r.departmentName} · {r.statusLabel}
                </div>
                {r.counterpartyName ? (
                  <div className="text-sm text-muted-foreground">{r.counterpartyName}</div>
                ) : null}
                <div className="flex gap-4 text-xs">
                  <span>
                    單據量{" "}
                    <strong className={`tabular-nums ${qtyClass(r.docQuantity)}`}>
                      {fmtSignedQty(r.docQuantity)}
                    </strong>
                  </span>
                  <span>
                    驗收量{" "}
                    <strong className={`tabular-nums ${qtyClass(r.inspectQuantity)}`}>
                      {fmtSignedQty(r.inspectQuantity)}
                    </strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-2">日期</th>
                  <th className="p-2">方向</th>
                  <th className="p-2">單據類型</th>
                  <th className="p-2">單據號碼</th>
                  <th className="p-2">部門</th>
                  <th className="p-2">對象</th>
                  <th className="p-2">狀態</th>
                  <th className="p-2 text-right">單據量</th>
                  <th className="p-2 text-right">驗收量</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.lineId} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.eventAt)}</td>
                    <td className="p-2">{flowZh[r.flow]}</td>
                    <td className="p-2">{r.documentType}</td>
                    <td className="p-2 font-mono">{r.documentNumber}</td>
                    <td className="p-2">{r.departmentName}</td>
                    <td className="p-2">{r.counterpartyName ?? "—"}</td>
                    <td className="p-2">{r.statusLabel}</td>
                    <td className={`p-2 text-right tabular-nums ${qtyClass(r.docQuantity)}`}>
                      {fmtSignedQty(r.docQuantity)}
                    </td>
                    <td className={`p-2 text-right tabular-nums ${qtyClass(r.inspectQuantity)}`}>
                      {fmtSignedQty(r.inspectQuantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
