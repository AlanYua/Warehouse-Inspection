/**
 * 商品主檔維護
 * 檔案：src/app/(shell)/master/products/page.tsx
 */

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { can } from "@/lib/permissions";

type Product = {
  id: string;
  productCode: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  storageLocation: string | null;
};

type BrandOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export default function ProductsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canDeleteProducts = !!(role && can(role, "products.delete"));
  const canBatchStorageProducts = !!(
    role && (can(role, "products.storageOnly") || can(role, "products.edit"))
  );
  const canSelectProducts = canDeleteProducts || canBatchStorageProducts;
  const [rows, setRows] = useState<Product[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [batchStorageOpen, setBatchStorageOpen] = useState(false);
  const [batchStorageValue, setBatchStorageValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const [form, setForm] = useState({
    productCode: "",
    name: "",
    brand: "",
    barcode: "",
    storageLocation: "",
  });
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [storageMsg, setStorageMsg] = useState<string | null>(null);
  const [brandsLoaded, setBrandsLoaded] = useState(false);

  const activeBrandNames = brands.filter((b) => b.isActive).map((b) => b.name);
  const selectedProductIds = Object.keys(sel).filter((k) => sel[k]);
  const allRowsSelected =
    canSelectProducts && rows.length > 0 && rows.every((r) => !!sel[r.id]);
  const someRowsSelected =
    canSelectProducts && rows.some((r) => !!sel[r.id]) && !allRowsSelected;

  async function loadBrands() {
    const br = await fetch("/api/brands", { credentials: "include" }).then((r) =>
      r.ok ? r.json() : [],
    );
    setBrands(br);
    setBrandsLoaded(true);
  }

  async function loadProducts(opts?: { page?: number }) {
    const k = keyword.trim();
    const selectedBrands = brandFilter.filter(Boolean);
    const hasCondition = Boolean(k) || selectedBrands.length > 0;
    if (!hasCondition) {
      setRows([]);
      setTotal(0);
      setLoadedOnce(false);
      setSel({});
      return;
    }

    const p = opts?.page ?? page;
    const offset = (p - 1) * PAGE_SIZE;
    const sp = new URLSearchParams();
    if (k) sp.set("q", k);
    sp.set("limit", String(PAGE_SIZE));
    sp.set("offset", String(offset));
    sp.set("withCount", "1");
    for (const b of selectedBrands) sp.append("brand", b);

    const res = await fetch(`/api/products?${sp.toString()}`, {
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStorageMsg(typeof j.error === "string" ? j.error : `查詢失敗（${res.status}）`);
      setRows([]);
      setTotal(0);
      setLoadedOnce(true);
      setSel({});
      return;
    }
    setRows(Array.isArray(j.rows) ? j.rows : []);
    setTotal(typeof j.total === "number" ? j.total : 0);
    setLoadedOnce(true);
    setSel({});
  }

  useEffect(() => {
    void loadBrands();
  }, []);

  useEffect(() => {
    if (!brandMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBrandMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [brandMenuOpen]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg(null);
    if (!brands.length) {
      setCreateMsg("尚未設定品牌；請先到設定頁建立品牌。");
      return;
    }
    if (!form.productCode.trim()) {
      setCreateMsg("請輸入貨品編號");
      return;
    }
    if (!form.name.trim()) {
      setCreateMsg("請輸入商品名稱");
      return;
    }
    if (!form.brand.trim()) {
      setCreateMsg("請選擇品牌");
      return;
    }
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        productCode: form.productCode,
        name: form.name,
        brand: form.brand || null,
        barcode: form.barcode || null,
        storageLocation: form.storageLocation || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateMsg(
        typeof j.error === "string"
          ? j.error
          : `新增失敗（${res.status}）`,
      );
      return;
    }
    const action = res.headers.get("x-product-action");
    setCreateMsg(
      action === "updated"
        ? "商品資料已更新"
        : "商品已建立",
    );
    setForm({
      productCode: "",
      name: "",
      brand: "",
      barcode: "",
      storageLocation: "",
    });
    if (loadedOnce) void loadProducts({ page: 1 });
  }

  async function importExcel(file: File | null) {
    if (!file) return;
    setImportMsg(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/import", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportMsg(j.error ?? (await res.text()));
        return;
      }
      const errTail =
        Array.isArray(j.errors) && j.errors.length
          ? `\n錯誤：\n${j.errors.slice(0, 15).join("\n")}`
          : "";
      setImportMsg(
        `匯入 ${j.imported ?? 0} 筆（略過空列 ${j.skippedEmpty ?? 0}）${errTail}`,
      );
      if (loadedOnce) void loadProducts({ page: 1 });
    } finally {
      setImporting(false);
    }
  }

  function openBatchStorage() {
    setStorageMsg(null);
    if (!selectedProductIds.length) {
      setStorageMsg("請先勾選商品，再按「批次設定儲位」。");
      return;
    }
    setBatchStorageValue("");
    setBatchStorageOpen(true);
  }

  async function applyBatchStorage() {
    setStorageMsg(null);
    if (!selectedProductIds.length) {
      setStorageMsg("請先勾選商品再批次設定儲位。");
      setBatchStorageOpen(false);
      return;
    }
    const storageLocation = batchStorageValue.trim();
    const updates = selectedProductIds.map((id) => ({
      id,
      storageLocation: storageLocation || null,
    }));
    if (!updates.length) {
      setStorageMsg("沒有可更新的商品。");
      setBatchStorageOpen(false);
      return;
    }
    const res = await fetch("/api/products/batch-storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ updates }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStorageMsg(
        typeof j.error === "string"
          ? j.error
          : res.status === 403
            ? "沒有權限更新儲位（需倉管或採購/管理員）。"
            : `更新失敗（${res.status}）`,
      );
      return;
    }
    setBatchStorageOpen(false);
    setSel({});
    setStorageMsg(`已更新 ${updates.length} 筆儲位。`);
    if (loadedOnce) void loadProducts();
  }

  async function batchDel() {
    if (!selectedProductIds.length) return;
    if (!confirm(`刪除 ${selectedProductIds.length} 筆？`)) return;
    await fetch("/api/products/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: selectedProductIds }),
    });
    setSel({});
    if (loadedOnce) void loadProducts();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">商品主檔</h1>
      </header>
      <div className="panel panel-body space-y-3">
        <h2 className="text-sm font-medium text-foreground">新增商品</h2>
        {createMsg && (
          <p
            className={`text-sm ${createMsg.includes("失敗") || createMsg.startsWith("請") ? "text-destructive" : "text-muted-foreground"}`}
          >
            {createMsg}
          </p>
        )}
        <form
          noValidate
          onSubmit={create}
          className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        >
          <input
            className="ui-input"
            placeholder="貨品編號"
            value={form.productCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, productCode: e.target.value }))
            }
          />
          <input
            className="ui-input sm:col-span-2 xl:col-span-2"
            placeholder="商品名稱"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            className="ui-select"
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            disabled={!brands.length}
          >
            <option value="">選擇品牌</option>
            {brands.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            className="ui-input"
            placeholder="國際條碼"
            value={form.barcode}
            onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
          />
          <input
            className="ui-input"
            placeholder="儲位"
            value={form.storageLocation}
            onChange={(e) =>
              setForm((f) => ({ ...f, storageLocation: e.target.value }))
            }
          />
          <div className="sm:col-span-2 xl:col-span-6">
            <button
              type="submit"
              disabled={!brands.length}
              className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed"
            >
              新增商品
            </button>
          </div>
        </form>
      </div>

      {brandsLoaded && !brands.length && (
        <p className="alert-warn max-w-3xl">
          尚未設定品牌，商品新增/匯入會被擋下。請先到{" "}
          <Link className="underline font-medium" href="/settings">
            設定
          </Link>{" "}
          建立品牌。
        </p>
      )}

      <div className="rounded-xl border border-border bg-card text-card-foreground p-4 text-sm space-y-2 max-w-3xl shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">Excel 匯入（.xlsx）</span>
          <Link
            href="/api/import/template/products"
            prefetch={false}
            className="text-sm rounded-md border border-input bg-secondary/60 px-3 py-1.5 text-secondary-foreground hover:bg-secondary"
          >
            下載範本
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          表頭需含：<strong>貨品編號（或貨號）、名稱、條碼、品牌</strong>；儲位可省略。每列貨號／品名／條碼／品牌皆須有值。同一貨號會更新既有資料。
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

      <div className="flex flex-col gap-2">
        {storageMsg && (
          <p
            className={`text-sm ${storageMsg.includes("失敗") || storageMsg.includes("沒有權限") ? "text-destructive" : "text-muted-foreground"}`}
          >
            {storageMsg}
          </p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="ui-input"
            placeholder="關鍵字查詢（貨號 / 條碼 / 名稱 / 品牌 / 儲位）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className="relative">
            <button
              type="button"
              disabled={!brands.length}
              className="min-w-60 h-9 inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setBrandMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={brandMenuOpen}
              title="品牌（可多選）"
            >
              <span className="truncate text-left">
                {brandFilter.length === 0
                  ? "品牌（全部）"
                  : brandFilter.length <= 2
                    ? brandFilter.join("、")
                    : `已選 ${brandFilter.length} 個品牌`}
              </span>
              <span className="text-muted-foreground">▾</span>
            </button>

            {brandMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setBrandMenuOpen(false)}
                  aria-label="close brand menu"
                />
                <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
                  <div className="p-2 border-b border-border flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      品牌（可多選）
                    </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setBrandFilter(activeBrandNames)}
                    >
                      全選
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setBrandFilter([])}
                    >
                      全清
                    </button>
                  </div>
                  </div>
                  <div className="max-h-64 overflow-auto p-2 space-y-1">
                    {brands.map((b) => {
                      const disabled = !b.isActive;
                      const checked = brandFilter.includes(b.name);
                      return (
                        <label
                          key={b.id}
                          className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground ${
                            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={checked}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setBrandFilter((cur) =>
                                on
                                  ? Array.from(new Set([...cur, b.name]))
                                  : cur.filter((x) => x !== b.name),
                              );
                            }}
                          />
                          <span className="truncate">{b.name}</span>
                        </label>
                      );
                    })}
                    {brands.length === 0 && (
                      <div className="text-xs text-muted-foreground px-2 py-2">
                        尚無品牌
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className="text-sm px-3 py-1 rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setStorageMsg(null);
              setPage(1);
              void loadProducts({ page: 1 });
            }}
          >
            查詢
          </button>
          <button
            type="button"
            className="text-sm px-3 py-1 rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setStorageMsg(null);
              setKeyword("");
              setBrandFilter([]);
              setRows([]);
              setTotal(0);
              setLoadedOnce(false);
              setSel({});
              setPage(1);
            }}
          >
            清除
          </button>
          {canBatchStorageProducts && (
            <button
              type="button"
              className="text-sm px-3 py-1 rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openBatchStorage()}
            >
              批次設定儲位
            </button>
          )}
          {canDeleteProducts && (
            <button
              type="button"
              className="text-sm px-3 py-1 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void batchDel()}
            >
              批次刪除
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {!loadedOnce ? (
            <>未查詢：預設不顯示任何商品（請輸入關鍵字或選品牌後按「查詢」）。</>
          ) : (
            <>
              查到 <strong className="text-foreground">{total}</strong> 筆，
              目前顯示第 <strong className="text-foreground">{page}</strong> /
              <strong className="text-foreground"> {totalPages}</strong> 頁（每頁 {PAGE_SIZE} 筆）
            </>
          )}
        </div>
      </div>

      {loadedOnce && totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canPrev}
            className="text-sm px-3 py-1 rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              void loadProducts({ page: next });
            }}
          >
            上一頁
          </button>
          <button
            type="button"
            disabled={!canNext}
            className="text-sm px-3 py-1 rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              const next = Math.min(totalPages, page + 1);
              setPage(next);
              void loadProducts({ page: next });
            }}
          >
            下一頁
          </button>
          <div className="text-xs text-muted-foreground">
            （超過 {PAGE_SIZE} 筆會分頁顯示）
          </div>
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1">
            <div className="flex items-start gap-2">
              {canSelectProducts && (
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
                <div className="font-medium text-sm">{r.name}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{r.productCode}</span>
                  {r.barcode && <span className="font-mono">{r.barcode}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                  <span>{r.brand ?? "—"}</span>
                  {r.storageLocation && <span className="font-mono">儲位 {r.storageLocation}</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && loadedOnce && (
          <p className="text-sm text-muted-foreground py-6 text-center">無資料</p>
        )}
      </div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto border border-border rounded-xl bg-card text-sm shadow-xs">
        <table className="min-w-full">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="p-2">
                {canSelectProducts && (
                  <input
                    type="checkbox"
                    checked={allRowsSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someRowsSelected;
                    }}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSel((s) => {
                        const next = { ...s };
                        for (const r of rows) {
                          if (on) next[r.id] = true;
                          else delete next[r.id];
                        }
                        return next;
                      });
                    }}
                    aria-label="toggle select all rows on this page"
                  />
                )}
              </th>
              <th className="text-left p-2">貨號</th>
              <th className="text-left p-2">條碼</th>
              <th className="text-left p-2">名稱</th>
              <th className="text-left p-2">品牌</th>
              <th className="text-left p-2">儲位</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2">
                  {canSelectProducts && (
                    <input
                      type="checkbox"
                      checked={!!sel[r.id]}
                      onChange={(e) =>
                        setSel((s) => ({ ...s, [r.id]: e.target.checked }))
                      }
                    />
                  )}
                </td>
                <td className="p-2 font-mono">{r.productCode}</td>
                <td className="p-2 font-mono text-xs">{r.barcode}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.brand ?? "—"}</td>
                <td className="p-2 font-mono">{r.storageLocation ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {batchStorageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground shadow-lg">
            <div className="p-4 border-b border-border flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-base font-semibold">批次設定儲位</div>
                <div className="text-xs text-muted-foreground">
                  已選取 {selectedProductIds.length} 筆商品
                </div>
              </div>
              <button
                type="button"
                className="text-sm px-3 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                onClick={() => setBatchStorageOpen(false)}
              >
                取消
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block space-y-1">
                <div className="text-sm font-medium">儲位</div>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="例如：A-01（留空 = 清除儲位）"
                  value={batchStorageValue}
                  onChange={(e) => setBatchStorageValue(e.target.value)}
                  autoFocus
                />
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="text-sm px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setBatchStorageOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void applyBatchStorage()}
                >
                  套用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
