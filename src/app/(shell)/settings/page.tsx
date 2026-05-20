/**
 * 設定首頁
 * 檔案：src/app/(shell)/settings/page.tsx
 */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Dept = { id: string; name: string };

type DocTypeRow = { id: string; name: string; flow: "OUT" | "IN" };

type BrandRow = { id: string; name: string; isActive: boolean };

type HeaderForm = {
  companyName: string;
  companyPhone: string;
  companyAddress: string;
};

async function readApiError(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const j = JSON.parse(raw) as { error?: unknown };
    if (typeof j.error === "string") return j.error;
  } catch {
    /* keep raw */
  }
  return raw || `HTTP ${res.status}`;
}

export default function SettingsPage() {
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [nameByDept, setNameByDept] = useState<Record<string, string>>({});
  const [selDept, setSelDept] = useState<Record<string, boolean>>({});
  const [header, setHeader] = useState<HeaderForm>({
    companyName: "",
    companyPhone: "",
    companyAddress: "",
  });
  const [deptMsgs, setDeptMsgs] = useState<Record<string, string | null>>({});
  const [headerMsg, setHeaderMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [docTypes, setDocTypes] = useState<DocTypeRow[]>([]);
  const [nameByDocType, setNameByDocType] = useState<Record<string, string>>(
    {},
  );
  const [flowByDocType, setFlowByDocType] = useState<Record<string, "OUT" | "IN">>(
    {},
  );
  const [newDocTypeName, setNewDocTypeName] = useState("");
  const [newDocTypeFlow, setNewDocTypeFlow] = useState<"OUT" | "IN">("OUT");
  const [createDocTypeMsg, setCreateDocTypeMsg] = useState<string | null>(null);
  const [docTypeMsgs, setDocTypeMsgs] = useState<
    Record<string, string | null>
  >({});

  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [nameByBrand, setNameByBrand] = useState<Record<string, string>>({});
  const [activeByBrand, setActiveByBrand] = useState<Record<string, boolean>>(
    {},
  );
  const [newBrandName, setNewBrandName] = useState("");
  const [createBrandMsg, setCreateBrandMsg] = useState<string | null>(null);
  const [brandMsgs, setBrandMsgs] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/print-settings", { credentials: "include" });
    if (!res.ok) {
      setLoaded(true);
      return;
    }
    const j = await res.json();
    const depts = (j.departments ?? []) as Dept[];
    setDepartments(depts);
    const names: Record<string, string> = {};
    for (const d of depts) names[d.id] = d.name;
    setNameByDept(names);
    setSelDept((prev) => {
      const next: Record<string, boolean> = {};
      for (const d of depts) next[d.id] = !!prev[d.id];
      return next;
    });
    const h = j.header as {
      companyName?: string;
      companyPhone?: string | null;
      companyAddress?: string | null;
    } | null;
    setHeader({
      companyName: h?.companyName ?? "",
      companyPhone: h?.companyPhone ?? "",
      companyAddress: h?.companyAddress ?? "",
    });
    const dtRes = await fetch("/api/document-types", { credentials: "include" });
    if (dtRes.ok) {
      const arr = (await dtRes.json()) as DocTypeRow[];
      setDocTypes(arr);
      const nm: Record<string, string> = {};
      for (const x of arr) nm[x.id] = x.name;
      setNameByDocType(nm);
      const fm: Record<string, "OUT" | "IN"> = {};
      for (const x of arr) fm[x.id] = x.flow;
      setFlowByDocType(fm);
    }

    const brRes = await fetch("/api/brands?includeInactive=1", {
      credentials: "include",
    });
    if (brRes.ok) {
      const arr = (await brRes.json()) as BrandRow[];
      setBrands(arr);
      const nm: Record<string, string> = {};
      const ac: Record<string, boolean> = {};
      for (const x of arr) {
        nm[x.id] = x.name;
        ac[x.id] = x.isActive;
      }
      setNameByBrand(nm);
      setActiveByBrand(ac);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  async function saveHeader(e: React.FormEvent) {
    e.preventDefault();
    setHeaderMsg(null);
    if (!header.companyName.trim()) {
      setHeaderMsg("公司名稱必填");
      return;
    }
    const res = await fetch("/api/print-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        companyName: header.companyName.trim(),
        companyPhone: header.companyPhone.trim() || null,
        companyAddress: header.companyAddress.trim() || null,
      }),
    });
    setHeaderMsg(res.ok ? "已儲存列印表頭" : await readApiError(res));
    if (res.ok) void load();
  }

  async function createDept(ev: React.FormEvent) {
    ev.preventDefault();
    setCreateMsg(null);
    const name = newDeptName.trim();
    if (!name) {
      setCreateMsg("請輸入部門名稱");
      return;
    }
    const res = await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setNewDeptName("");
      setCreateMsg("已建立部門");
      void load();
      return;
    }
    setCreateMsg(await readApiError(res));
  }

  async function createDocType(ev: React.FormEvent) {
    ev.preventDefault();
    setCreateDocTypeMsg(null);
    const name = newDocTypeName.trim();
    if (!name) {
      setCreateDocTypeMsg("請輸入類型名稱");
      return;
    }
    const res = await fetch("/api/document-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, flow: newDocTypeFlow }),
    });
    if (res.ok) {
      setNewDocTypeName("");
      setNewDocTypeFlow("OUT");
      setCreateDocTypeMsg("已新增");
      void load();
      return;
    }
    setCreateDocTypeMsg(await readApiError(res));
  }

  async function saveDocType(typeId: string, e: React.FormEvent) {
    e.preventDefault();
    setDocTypeMsgs((m) => ({ ...m, [typeId]: null }));
    const nextName = nameByDocType[typeId]?.trim();
    if (!nextName) {
      setDocTypeMsgs((m) => ({ ...m, [typeId]: "名稱必填" }));
      return;
    }
    const nextFlow = flowByDocType[typeId] ?? "OUT";
    const prev = docTypes.find((t) => t.id === typeId)?.name;
    const prevFlow = docTypes.find((t) => t.id === typeId)?.flow;
    if (prev === nextName && prevFlow === nextFlow) return;
    const patchRes = await fetch(`/api/document-types/${typeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: nextName, flow: nextFlow }),
    });
    const msg = patchRes.ok ? "已更新（含同類型單據）" : await readApiError(patchRes);
    setDocTypeMsgs((m) => ({ ...m, [typeId]: msg }));
    if (patchRes.ok) void load();
  }

  async function deleteDocType(typeId: string) {
    const nm = docTypes.find((t) => t.id === typeId)?.name ?? "";
    if (!confirm(`刪除單據類型「${nm}」？`)) return;
    setDocTypeMsgs((m) => ({ ...m, [typeId]: null }));
    const res = await fetch(`/api/document-types/${typeId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const msg = res.ok ? "已刪除" : await readApiError(res);
    setDocTypeMsgs((m) => ({ ...m, [typeId]: msg }));
    if (res.ok) void load();
  }

  async function createBrand(ev: React.FormEvent) {
    ev.preventDefault();
    setCreateBrandMsg(null);
    const name = newBrandName.trim();
    if (!name) {
      setCreateBrandMsg("請輸入品牌名稱");
      return;
    }
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setNewBrandName("");
      setCreateBrandMsg("已新增");
      void load();
      return;
    }
    setCreateBrandMsg(await readApiError(res));
  }

  async function saveBrand(brandId: string, e: React.FormEvent) {
    e.preventDefault();
    setBrandMsgs((m) => ({ ...m, [brandId]: null }));
    const nextName = nameByBrand[brandId]?.trim();
    if (!nextName) {
      setBrandMsgs((m) => ({ ...m, [brandId]: "名稱必填" }));
      return;
    }
    const nextActive = !!activeByBrand[brandId];
    const prev = brands.find((b) => b.id === brandId);
    if (prev && prev.name === nextName && prev.isActive === nextActive) return;
    const patchRes = await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: nextName, isActive: nextActive }),
    });
    const msg = patchRes.ok ? "已更新" : await readApiError(patchRes);
    setBrandMsgs((m) => ({ ...m, [brandId]: msg }));
    if (patchRes.ok) void load();
  }

  async function deleteBrand(brandId: string) {
    const nm = brands.find((b) => b.id === brandId)?.name ?? "";
    if (!confirm(`刪除品牌「${nm}」？`)) return;
    setBrandMsgs((m) => ({ ...m, [brandId]: null }));
    const res = await fetch(`/api/brands/${brandId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const msg = res.ok ? "已刪除" : await readApiError(res);
    setBrandMsgs((m) => ({ ...m, [brandId]: msg }));
    if (res.ok) void load();
  }

  async function saveDept(deptId: string, e: React.FormEvent) {
    e.preventDefault();
    setDeptMsgs((m) => ({ ...m, [deptId]: null }));
    const deptName = nameByDept[deptId]?.trim();
    if (!deptName) {
      setDeptMsgs((m) => ({ ...m, [deptId]: "部門名稱必填" }));
      return;
    }
    const prevName = departments.find((d) => d.id === deptId)?.name;
    if (prevName === deptName) return;
    const patchRes = await fetch(`/api/departments/${deptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: deptName }),
    });
    const msg = patchRes.ok ? "已更新部門名稱" : await readApiError(patchRes);
    setDeptMsgs((m) => ({ ...m, [deptId]: msg }));
    if (patchRes.ok) void load();
  }

  async function deleteDept(deptId: string) {
    const nm = departments.find((d) => d.id === deptId)?.name ?? "";
    if (!confirm(`刪除部門「${nm}」？（僅可刪除未被使用者）`)) return;
    setDeptMsgs((m) => ({ ...m, [deptId]: null }));
    const res = await fetch(`/api/departments/${deptId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const msg = res.ok ? "已刪除" : await readApiError(res);
    setDeptMsgs((m) => ({ ...m, [deptId]: msg }));
    if (res.ok) {
      setSelDept((s) => {
        const next = { ...s };
        delete next[deptId];
        return next;
      });
      void load();
    }
  }

  async function batchDeleteDept() {
    const ids = Object.keys(selDept).filter((id) => selDept[id]);
    if (!ids.length) return;
    if (!confirm(`刪除 ${ids.length} 個部門？（僅可刪除未被使用者）`)) return;
    setCreateMsg(null);
    const res = await fetch("/api/departments/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      setCreateMsg(await readApiError(res));
      return;
    }
    setSelDept({});
    setCreateMsg("已刪除");
    void load();
  }

  if (!loaded) return <p className="text-muted-foreground">載入中…</p>;

  return (
    <div className="space-y-10 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            設定
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            列印表頭全公司一份；部門可在此新增或更名。新部門產生後，列印仍使用下方同一組表頭。
          </p>
        </div>
         </div>

      <details className="group rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden p-4 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors">
          <div>
            <h2 className="text-lg font-semibold text-foreground">列印表頭（統一）</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {header.companyName || "尚未設定"}
            </p>
          </div>
          <span className="text-muted-foreground text-sm shrink-0 group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <div className="p-4 pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            所有部門的批次列印單據皆使用此抬頭。
          </p>
          <form
            onSubmit={(e) => void saveHeader(e)}
            className="space-y-3 text-sm"
          >
            <div>
              <label className="block text-xs text-muted-foreground">
                公司名稱
              </label>
              <input
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={header.companyName}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, companyName: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground">
                公司電話
              </label>
              <input
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={header.companyPhone}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, companyPhone: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground">
                公司地址
              </label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={2}
                value={header.companyAddress}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, companyAddress: e.target.value }))
                }
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              儲存列印表頭
            </button>
            {headerMsg && (
              <p className="text-sm text-foreground/90">{headerMsg}</p>
            )}
          </form>
        </div>
      </details>

      <details className="group rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden p-4 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors">
          <div>
            <h2 className="text-lg font-semibold text-foreground">單據類型</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {docTypes.length} 筆{docTypes.length > 0 && `（${docTypes.map((t) => t.name).join("、")}）`}
            </p>
          </div>
          <span className="text-muted-foreground text-sm shrink-0 group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <div className="p-4 pt-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            主檔<strong>至少一筆</strong>時，Excel 匯入與 API／DB 同步僅接受此處名稱，避免打錯。
            主檔為空時不檢核類型。更名會一併更新已建立單據上的類型文字。
          </p>
          <form
            onSubmit={(e) => void createDocType(e)}
            className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-border bg-muted/50 text-sm shadow-xs"
          >
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-xs text-muted-foreground mb-1">
                新增單據類型
              </label>
              <input
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="例如：一般、銷退、換貨"
                value={newDocTypeName}
                onChange={(e) => setNewDocTypeName(e.target.value)}
              />
            </div>
            <div className="min-w-[9rem]">
              <label className="block text-xs text-muted-foreground mb-1">
                驗出/驗入
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newDocTypeFlow}
                onChange={(e) => setNewDocTypeFlow(e.target.value as "OUT" | "IN")}
              >
                <option value="OUT">驗出</option>
                <option value="IN">驗入</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-md border border-input bg-background font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              新增
            </button>
            {createDocTypeMsg && (
              <p className="text-sm text-foreground/90 w-full">{createDocTypeMsg}</p>
            )}
          </form>
          {docTypes.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              尚未建立單據類型。匯入目前不檢核類型；建議新增與實際單據一致的名稱。若曾執行 seed，範例單在建立主檔後再跑一次 seed 會自動對齊主檔。
            </p>
          ) : (
            <div className="space-y-4">
              {docTypes.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-end gap-3 bg-background border border-border p-4 rounded-xl text-sm shadow-xs"
                >
                  <form
                    className="flex flex-wrap items-end gap-3 flex-1 min-w-0"
                    onSubmit={(e) => void saveDocType(t.id, e)}
                  >
                    <div className="flex-1 min-w-[12rem]">
                      <label className="block text-xs text-muted-foreground mb-1">
                        類型名稱
                      </label>
                      <input
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={nameByDocType[t.id] ?? ""}
                        onChange={(e) =>
                          setNameByDocType((x) => ({
                            ...x,
                            [t.id]: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div className="min-w-[9rem]">
                      <label className="block text-xs text-muted-foreground mb-1">
                        驗出/驗入
                      </label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={flowByDocType[t.id] ?? "OUT"}
                        onChange={(e) =>
                          setFlowByDocType((m) => ({
                            ...m,
                            [t.id]: e.target.value as "OUT" | "IN",
                          }))
                        }
                      >
                        <option value="OUT">驗出</option>
                        <option value="IN">驗入</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-md border border-input bg-background font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      更新
                    </button>
                  </form>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md border border-destructive/30 text-destructive font-medium hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => void deleteDocType(t.id)}
                  >
                    刪除
                  </button>
                  {docTypeMsgs[t.id] && (
                    <p className="text-sm text-foreground/90 w-full">
                      {docTypeMsgs[t.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <details className="group rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden p-4 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors">
          <div>
            <h2 className="text-lg font-semibold text-foreground">品牌</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {brands.length} 筆（啟用 {brands.filter((b) => b.isActive).length}）
            </p>
          </div>
          <span className="text-muted-foreground text-sm shrink-0 group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <div className="p-4 pt-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            商品建立／匯入會<strong>強制</strong>使用此處已啟用的品牌（避免品牌打錯/不一致）。
          </p>
          <form
            onSubmit={(e) => void createBrand(e)}
            className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-border bg-muted/50 text-sm shadow-xs"
          >
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-xs text-muted-foreground mb-1">
                新增品牌
              </label>
              <input
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="品牌大小寫需一致"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-md border border-input bg-background font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              新增
            </button>
            {createBrandMsg && (
              <p className="text-sm text-foreground/90 w-full">{createBrandMsg}</p>
            )}
          </form>

          {brands.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              尚未建立品牌。建立後，商品新增/匯入才會放行。
            </p>
          ) : (
            <div className="space-y-4">
              {brands.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-end gap-3 bg-background border border-border p-4 rounded-xl text-sm shadow-xs"
                >
                  <form
                    className="flex flex-wrap items-end gap-3 flex-1 min-w-0"
                    onSubmit={(e) => void saveBrand(b.id, e)}
                  >
                    <div className="flex-1 min-w-[12rem]">
                      <label className="block text-xs text-muted-foreground mb-1">
                        品牌名稱
                      </label>
                      <input
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={nameByBrand[b.id] ?? ""}
                        onChange={(e) =>
                          setNameByBrand((x) => ({ ...x, [b.id]: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={!!activeByBrand[b.id]}
                        onChange={(e) =>
                          setActiveByBrand((m) => ({
                            ...m,
                            [b.id]: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm">啟用</span>
                    </label>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-md border border-input bg-background font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      更新
                    </button>
                  </form>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md border border-destructive/30 text-destructive font-medium hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => void deleteBrand(b.id)}
                  >
                    刪除
                  </button>
                  {brandMsgs[b.id] && (
                    <p className="text-sm text-foreground/90 w-full">
                      {brandMsgs[b.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <details className="group rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden p-4 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors">
          <div>
            <h2 className="text-lg font-semibold text-foreground">部門</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {departments.length} 個{departments.length > 0 && `（${departments.map((d) => d.name).join("、")}）`}
            </p>
          </div>
          <span className="text-muted-foreground text-sm shrink-0 group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <div className="p-4 pt-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            新增或更改部門名稱（單據、儀表板依部門區分）。
          </p>

          <form
            onSubmit={(e) => void createDept(e)}
            className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-border bg-muted/50 text-sm shadow-xs"
          >
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-xs text-muted-foreground mb-1">
                新增部門
              </label>
              <input
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="部門名稱"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-md border border-input bg-background font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              建立部門
            </button>
            {createMsg && (
              <p className="text-sm text-foreground/90 w-full">{createMsg}</p>
            )}
          </form>

          {departments.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              尚無部門。請先新增，或從通路匯入建立。
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-destructive/30 text-destructive font-medium hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void batchDeleteDept()}
                >
                  批次刪除
                </button>
                <span className="text-xs text-muted-foreground">
                  已選取 {Object.keys(selDept).filter((k) => selDept[k]).length} 個
                </span>
              </div>
              {departments.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-end gap-3 bg-background border border-border p-4 rounded-xl text-sm shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!selDept[d.id]}
                      onChange={(e) =>
                        setSelDept((s) => ({ ...s, [d.id]: e.target.checked }))
                      }
                    />
                  </div>
                  <form
                    onSubmit={(e) => void saveDept(d.id, e)}
                    className="flex flex-wrap items-end gap-3 flex-1 min-w-0"
                  >
                    <div className="flex-1 min-w-[12rem]">
                      <label className="block text-xs text-muted-foreground mb-1">
                        部門名稱
                      </label>
                      <input
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={nameByDept[d.id] ?? ""}
                        onChange={(e) =>
                          setNameByDept((x) => ({ ...x, [d.id]: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-md border border-input bg-background font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      更新名稱
                    </button>
                  </form>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md border border-destructive/30 text-destructive font-medium hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => void deleteDept(d.id)}
                  >
                    刪除
                  </button>
                  {deptMsgs[d.id] && (
                    <p className="text-sm text-foreground/90 w-full">
                      {deptMsgs[d.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
