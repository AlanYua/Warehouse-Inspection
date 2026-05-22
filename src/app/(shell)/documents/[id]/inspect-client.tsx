/**
 * (client) 掃碼驗收、鎖定與送出
 * 檔案：src/app/(shell)/documents/[id]/inspect-client.tsx
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AcceptMethod,
  DocumentStatus,
  Role,
} from "@prisma/client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOGISTICS_SELF_PICKUP,
  LOGISTICS_WAREHOUSE_DELIVERY,
  resolveShipDelivery,
} from "@/lib/documents/ship-delivery";
import { BarcodeCamera } from "@/components/BarcodeCamera";
import { canDeleteDocument } from "@/lib/documents/delete-guard";
import { can } from "@/lib/permissions";
import type { Doc } from "./inspect-types";
import { statusLabel, flowZh, sortDocumentLines } from "./inspect-types";
import InspectProgress from "./inspect-progress";
import InspectRoleModal from "./inspect-role-modal";
import LineItemsView, { type LineItemsLineMode } from "./line-items-view";

export default function DocumentInspect({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const salesPickerOnly = role === Role.SALES;
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [camTarget, setCamTarget] = useState<"line" | "logistics" | null>(null);
  const [manualCode, setManualCode] = useState("");
  /** 條碼／貨號每次累加的數量（可大於 1） */
  const [barcodeBumpQty, setBarcodeBumpQty] = useState("1");
  const [logisticsNo, setLogisticsNo] = useState("");
  const [selfPickup, setSelfPickup] = useState(false);
  const [warehouseDelivery, setWarehouseDelivery] = useState(false);
  const [shipping, setShipping] = useState(false);
  const autoShipLnRef = useRef("");
  const [packageCountA, setPackageCountA] = useState("");
  const [packageCountC, setPackageCountC] = useState("");
  const [packageSize, setPackageSize] = useState("");
  const [inspectRoleModal, setInspectRoleModal] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/documents/${id}`, { credentials: "include" });
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        setErr(typeof j.error === "string" ? j.error : t);
      } catch {
        setErr(t);
      }
      return;
    }
    setDoc(await res.json());
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 非同步 fetch 後才 setState
    void load();
  }, [load]);

  const canShip = role && can(role, "documents.ship");
  const canStock = role && can(role, "documents.stock");

  useEffect(() => {
    if (!doc) return;
    void (async () => {
      setPackageCountA((cur) => cur || String(doc.packageCountA ?? 0));
      setPackageCountC((cur) => cur || String(doc.packageCountC ?? 0));
      setPackageSize((cur) => cur || doc.packageSize || "");

      // 只有在「已完成」要出貨時才載入揀貨人選項、物流單號
      if (!canShip || doc.status !== DocumentStatus.COMPLETED) return;
      const ln = (doc.logisticsNo ?? "").trim();
      if (ln === LOGISTICS_SELF_PICKUP) {
        setSelfPickup(true);
        setWarehouseDelivery(false);
        setLogisticsNo("");
      } else if (ln === LOGISTICS_WAREHOUSE_DELIVERY) {
        setWarehouseDelivery(true);
        setSelfPickup(false);
        setLogisticsNo("");
      } else {
        setSelfPickup(false);
        setWarehouseDelivery(false);
        setLogisticsNo((cur) => cur || ln);
      }
      autoShipLnRef.current = "";
    })();
  }, [
    doc,
    canShip,
  ]);

  const noLogisticsInput = selfPickup || warehouseDelivery;

  useEffect(() => {
    if (!doc || doc.status !== DocumentStatus.COMPLETED || !canShip) return;
    if (doc.flow !== "OUT") return;
    if (noLogisticsInput) return;
    const ln = logisticsNo.trim().replace(/\s+/g, "");
    if (!ln || ln === autoShipLnRef.current) return;
    autoShipLnRef.current = ln;
    const t = setTimeout(() => void ship(), 600);
    return () => clearTimeout(t);
  }, [
    logisticsNo,
    noLogisticsInput,
    doc,
    canShip,
  ]);

  async function ensureLock(inspectAs: "PICKER" | "INSPECTOR") {
    const res = await fetch(`/api/documents/${id}/lock`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectAs }),
    });
    if (res.status === 409) {
      const j = await res.json().catch(() => ({}));
      setErr(`${j.error ?? ""} ${j.lockedByName ?? ""}`);
      return false;
    }
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        setErr(typeof j.error === "string" ? j.error : t);
      } catch {
        setErr(t);
      }
      return false;
    }
    setErr(null);
    setDoc(await res.json());
    return true;
  }

  async function startInspectAs(inspectAs: "PICKER" | "INSPECTOR") {
    if (!(role && can(role, "documents.inspect"))) return;
    if (salesPickerOnly && inspectAs === "INSPECTOR") {
      setErr(
        doc?.flow === "IN"
          ? "業務無法執行驗入檢驗"
          : "業務僅可擔任揀貨者，不能擔任驗收者",
      );
      return;
    }
    setInspectRoleModal(false);
    await ensureLock(inspectAs);
  }

  async function cancelInspect() {
    const label =
      doc?.flow === "IN"
        ? "檢驗者"
        : doc?.inspector?.id === selfId
          ? "驗收者"
          : "揀貨者";
    if (
      !window.confirm(
        `確定取消您的${label}身份？單據將回到可重新選擇的狀態。`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/documents/${id}/cancel-inspect`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        setErr(typeof j.error === "string" ? j.error : t);
      } catch {
        setErr(t);
      }
      return;
    }
    setErr(null);
    void load();
  }

  async function releaseHandoff() {
    if (
      !window.confirm(
        "揀貨完成並交驗收？將解鎖單據（仍為驗收中），由驗收者接鎖後以條碼或手動方式核對驗收量。",
      )
    ) {
      return;
    }
    const res = await fetch(`/api/documents/${id}/release-lock`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        setErr(typeof j.error === "string" ? j.error : t);
      } catch {
        setErr(t);
      }
      return;
    }
    setErr(null);
    void load();
  }

  async function completeInspect(mode: "with-inspector" | "picker-only") {
    if (doc) {
      const invalid = doc.lines.filter((l) => l.inspectQuantity > l.docQuantity);
      if (invalid.length) {
        setErr("驗收量不可大於單據量");
        window.alert(
          [
            "驗收量超過單據數量，無法完成單據。",
            ...invalid.slice(0, 10).map((l) => {
              const over = l.inspectQuantity - l.docQuantity;
              return `- ${l.productName}（${l.productCode}）：單據 ${l.docQuantity}／驗收 ${l.inspectQuantity}（超出 ${over}）`;
            }),
            invalid.length > 10 ? `…其餘 ${invalid.length - 10} 筆略` : null,
            "請先把超量品項修正到不超過單據量，再按完成。",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return;
      }
    }

    if (mode === "picker-only" && doc) {
      const notAllPicked = doc.lines.some((l) => !(l.pickerPicked ?? false));
      if (notAllPicked) {
        setErr("略過驗收前請先勾選所有品項「揀過」");
        window.alert(
          "略過驗收完成前，請在每一列勾選「揀過」，表示揀貨完成。",
        );
        return;
      }
    }

    const ok =
      mode === "picker-only"
        ? window.confirm(
            "略過驗收者，以目前驗收量儲存並完成？（僅揀貨、無第二人驗收時使用）",
          )
        : window.confirm(
            "確定儲存並完成此單據？將標記為「已完成」，之後可標記出貨/入庫。",
          );
    if (!ok) return;
    const a = Number(String(packageCountA).trim());
    const c = Number(String(packageCountC).trim());
    if (!Number.isFinite(a) || a < 0 || !Number.isInteger(a)) {
      setErr("A 件數需為非負整數");
      return;
    }
    if (!Number.isFinite(c) || c < 0 || !Number.isInteger(c)) {
      setErr("C 件數需為非負整數");
      return;
    }
    if (a + c <= 0) {
      setErr("A/C 件數需至少一項大於 0");
      return;
    }

    const res = await fetch(`/api/documents/${id}/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageCountA: a, packageCountC: c }),
    });
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        setErr(j.error ?? t);
      } catch {
        setErr(t);
      }
      return;
    }
    setErr(null);
    setDoc(await res.json());
    promptPrintAfterComplete();
  }

  function openPrintTab() {
    window.open(
      `/print/documents?ids=${encodeURIComponent(id)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function promptPrintAfterComplete() {
    if (
      typeof window !== "undefined" &&
      window.confirm("是否列印此單據？")
    ) {
      openPrintTab();
    }
  }

  async function savePatch(body: unknown) {
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    setDoc(await res.json());
  }

  async function ship(override?: {
    selfPickup?: boolean;
    warehouseDelivery?: boolean;
    logisticsNo?: string;
  }) {
    if (shipping || doc?.status !== DocumentStatus.COMPLETED) return;
    const ln = (override?.logisticsNo ?? logisticsNo).trim().replace(/\s+/g, "");
    const delivery = resolveShipDelivery({
      selfPickup: override?.selfPickup ?? selfPickup,
      warehouseDelivery: override?.warehouseDelivery ?? warehouseDelivery,
      logisticsNo: ln,
    });
    if (!delivery.ok) {
      setErr(delivery.error);
      return;
    }
    const a = Number(String(packageCountA).trim());
    const c = Number(String(packageCountC).trim());
    if (!Number.isFinite(a) || a < 0 || !Number.isInteger(a)) {
      setErr("A 件數需為非負整數");
      return;
    }
    if (!Number.isFinite(c) || c < 0 || !Number.isInteger(c)) {
      setErr("C 件數需為非負整數");
      return;
    }
    if (!delivery.skipPackageCount && a + c <= 0) {
      setErr("A/C 件數需至少一項大於 0");
      return;
    }
    const ps = packageSize.trim();
    setShipping(true);
    setErr(null);
    const res = await fetch(`/api/documents/${id}/ship`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selfPickup: delivery.selfPickup,
        warehouseDelivery: delivery.warehouseDelivery,
        ...(delivery.skipPackageCount
          ? {}
          : { logisticsNo: delivery.logisticsNo }),
        packageCountA: a,
        packageCountC: c,
        ...(ps ? { packageSize: ps } : {}),
      }),
    });
    setShipping(false);
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        setErr(j.error ?? t);
      } catch {
        setErr(t);
      }
      return;
    }
    setDoc(await res.json());
  }

  async function unlock() {
    const res = await fetch(`/api/documents/${id}/unlock`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        setErr(typeof j.error === "string" ? j.error : t);
      } catch {
        setErr(t);
      }
      return;
    }
    setErr(null);
    void load();
  }

  async function removeDoc() {
    if (!role || !can(role, "documents.delete") || !doc) return;
    const delCheck = canDeleteDocument(role, doc);
    if (!delCheck.ok) {
      setErr(delCheck.message);
      return;
    }
    if (
      !window.confirm(
        `確定刪除單據「${doc?.documentNumber ?? id}」？此動作無法復原。`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/documents/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    router.push("/documents");
    router.refresh();
  }

  function parseAccumulateDelta(raw: string): number {
    const n = Number(String(raw).trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 1;
    return n;
  }

  function normCode(s: string): string {
    return String(s ?? "").trim().replace(/\s+/g, "");
  }

  function normBarcode(s: string): string {
    // 掃描器/Excel/主檔常見格式差異：空白、破折號、其他分隔符
    return normCode(s).replace(/[^0-9A-Za-z]/g, "");
  }

  function bumpLineByCode(code: string, deltaOverride?: number) {
    if (!doc) return;
    const raw = String(code ?? "");
    const c = normCode(raw);
    const b = normBarcode(raw);
    if (!c && !b) return;
    const line = doc.lines.find(
      (l) =>
        normCode(l.productCode) === c ||
        (l.barcode && normBarcode(l.barcode) === b),
    );
    if (!line) {
      setErr(`找不到貨號/條碼：${raw.trim()}`);
      return;
    }
    const add =
      deltaOverride !== undefined
        ? deltaOverride
        : parseAccumulateDelta(barcodeBumpQty);
    const rawNext = line.inspectQuantity + add;
    const nextQty = Math.min(line.docQuantity, rawNext);

    if (rawNext > line.docQuantity) {
      const over = rawNext - line.docQuantity;
      window.alert(
        [
          "驗收量超過單據數量。",
          `品項：${line.productName}（${line.productCode}）`,
          `單據數：${line.docQuantity}　目前驗收：${line.inspectQuantity}　本次累加：${add}`,
          `多撿：${over}`,
          nextQty === line.inspectQuantity
            ? "已達單據數量上限，無法再增加。"
            : `已改為驗收量 ${nextQty}（以單據數量為上限）。`,
        ].join("\n"),
      );
    }

    if (nextQty === line.inspectQuantity) {
      setManualCode("");
      setErr(null);
      return;
    }

    const snapshot = doc;
    setDoc((d) =>
      d
        ? {
            ...d,
            acceptMethod: AcceptMethod.BARCODE,
            lines: d.lines.map((x) =>
              x.id === line.id ? { ...x, inspectQuantity: nextQty } : x,
            ),
          }
        : d,
    );
    setManualCode("");
    setErr(null);
    void (async () => {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptMethod: AcceptMethod.BARCODE,
          lines: [{ id: line.id, inspectQuantity: nextQty }],
        }),
      });
      if (!res.ok) {
        setDoc(snapshot);
        setErr(await res.text());
        return;
      }
      setDoc(await res.json());
    })();
  }

  if (!doc) {
    if (err) {
      return (
        <div className="space-y-4">
          <p className="alert-error">{err}</p>
          <Link href="/documents" className="btn-secondary">
            返回列表
          </Link>
        </div>
      );
    }
    return <p className="text-muted-foreground">載入中…</p>;
  }

  const canInspect = role && can(role, "documents.inspect");
  const canDeleteDoc =
    role &&
    can(role, "documents.delete") &&
    canDeleteDocument(role, doc).ok;
  const salesBlockedAsInspector = salesPickerOnly;
  const salesCannotInspectIn = salesPickerOnly && doc.flow === "IN";
  const canUnlock = role && can(role, "documents.unlock");
  const unlockAllowedByFlow =
    (role === Role.WAREHOUSE_SUPERVISOR && doc.flow === "IN") ||
    role === Role.ADMIN;
  const showShip =
    canInspect &&
    canShip &&
    doc.flow === "OUT" &&
    doc.status === DocumentStatus.COMPLETED;
  const shipped = doc.status === DocumentStatus.SHIPPED;
  const completed = doc.status === DocumentStatus.COMPLETED;
  const stocked =
    doc.flow === "IN" &&
    doc.status === DocumentStatus.COMPLETED &&
    Boolean(doc.stockedAt);
  const qtyInvalid = doc.lines.some((l) => l.inspectQuantity > l.docQuantity);
  const inspectingUnlocked =
    doc.status === DocumentStatus.INSPECTING && !doc.lockedBy;
  const editable =
    !shipped &&
    !completed &&
    doc.status === DocumentStatus.INSPECTING &&
    (role === Role.ADMIN ||
      doc.lockedBy?.id === session?.user?.id);
  const selfId = session?.user?.id;
  const pickerPicking =
    doc.flow === "OUT" &&
    Boolean(selfId) &&
    editable &&
    doc.picker != null &&
    doc.picker.id === selfId &&
    !doc.inspector;
  const inspectorLikeEditing =
    editable &&
    doc.inspector != null &&
    (role === Role.ADMIN ||
      (selfId != null && doc.inspector.id === selfId));
  const lineItemsMode: LineItemsLineMode = !editable
    ? "readonly"
    : pickerPicking
      ? "picker"
      : "inspector";
  const showHandoffToInspector =
    doc.flow === "OUT" &&
    canInspect &&
    doc.status === DocumentStatus.INSPECTING &&
    editable &&
    doc.acceptMethod === AcceptMethod.MANUAL &&
    !doc.inspector;
  const showCompleteWithInspector =
    canInspect &&
    doc.status === DocumentStatus.INSPECTING &&
    editable &&
    doc.inspector != null;
  const showCompletePickerOnly =
    doc.flow === "OUT" &&
    canInspect &&
    doc.status === DocumentStatus.INSPECTING &&
    editable &&
    doc.acceptMethod === AcceptMethod.MANUAL &&
    !doc.inspector;
  const canClaimPickerContinue =
    doc.flow === "OUT" &&
    canInspect &&
    inspectingUnlocked &&
    !doc.inspector &&
    doc.picker != null &&
    doc.picker.id === selfId;
  const canClaimInspectorNew =
    !salesBlockedAsInspector &&
    canInspect &&
    inspectingUnlocked &&
    doc.flow === "OUT" &&
    doc.picker != null &&
    !doc.inspector;
  const canClaimInspectorInIn =
    !salesBlockedAsInspector &&
    canInspect &&
    inspectingUnlocked &&
    doc.flow === "IN" &&
    !doc.inspector;
  const canClaimInspectorResume =
    !salesBlockedAsInspector &&
    canInspect &&
    inspectingUnlocked &&
    doc.inspector != null &&
    doc.inspector.id === selfId;
  const canCancelInspect =
    canInspect &&
    doc.status === DocumentStatus.INSPECTING &&
    (doc.lockedBy?.id === selfId || !doc.lockedBy) &&
    ((doc.inspector?.id === selfId) ||
      (doc.picker?.id === selfId && !doc.inspector));

  const linesSorted = sortDocumentLines(
    doc.lines,
    doc.status === DocumentStatus.INSPECTING ? "inspect" : "storage",
  );

  const totalDocQty = doc.lines.reduce((s, l) => s + l.docQuantity, 0);
  const totalInspectQty = pickerPicking
    ? doc.lines
        .filter((l) => l.pickerPicked ?? false)
        .reduce((s, l) => s + l.docQuantity, 0)
    : doc.lines.reduce((s, l) => s + l.inspectQuantity, 0);
  const totalDone = pickerPicking
    ? doc.lines.filter((l) => l.pickerPicked ?? false).length
    : doc.lines.filter((l) => l.inspectQuantity >= l.docQuantity).length;
  const progressPct = pickerPicking
    ? doc.lines.length > 0
      ? Math.min(100, Math.round((totalDone / doc.lines.length) * 100))
      : 0
    : totalDocQty > 0
      ? Math.min(100, Math.round((totalInspectQty / totalDocQty) * 100))
      : 0;

  return (
    <div className="space-y-4">
      {shipped && (
        <p className="alert-warn">已出貨，僅供檢視。</p>
      )}
      {completed && !shipped && doc.flow === "OUT" && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
          已完成驗收。填寫物流單號後自動出貨；自取／倉庫親送請勾選後按「出貨」（A/C 選填作紀錄）；需列印請按單據區塊上的「列印」。
        </p>
      )}
      {completed && !shipped && doc.flow === "IN" && !stocked && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
          已完成驗收。倉庫主管請按「已完成上架」標記入庫。
        </p>
      )}
      {stocked && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
          已入庫{doc.stockedBy?.name ? `（${doc.stockedBy.name}）` : ""}。
        </p>
      )}
      {!shipped && !completed && qtyInvalid && (
        <p className="alert-error">
          有品項「驗收量」大於「單據量」，請先修正後才能完成單據。
        </p>
      )}
      {err && <p className="alert-error">{err}</p>}
      {salesCannotInspectIn && !shipped && !completed && (
        <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          業務帳號僅可處理驗出揀貨，無法執行驗入檢驗。
        </p>
      )}
      {canInspect &&
        !salesCannotInspectIn &&
        inspectingUnlocked &&
        !shipped &&
        !completed && (
        <div className="inspect-claim-panel">
          <p className="font-medium">此單據已交棒、目前無人鎖定</p>
          <p className="text-xs opacity-90">
            {doc.flow === "IN"
              ? "檢驗者接鎖後可手改驗收量（手動核對）或掃條碼累加（條碼核對）。同時間僅一人能鎖定。"
              : "揀貨者可回來勾選「揀過」；驗收者接鎖後可手改驗收量（手動核對）或掃條碼累加（條碼核對）。同時間僅一人能鎖定。"}
          </p>
          {doc.inspector &&
            selfId &&
            doc.inspector.id !== selfId && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                已登記驗收者為「{doc.inspector.name}」，須由其本人接鎖。
              </p>
            )}
          <div className="toolbar pt-1">
            {canClaimPickerContinue && (
              <button
                type="button"
                className="btn-info-outline"
                onClick={() => void startInspectAs("PICKER")}
              >
                我以揀貨者繼續
              </button>
            )}
            {canClaimInspectorNew || canClaimInspectorInIn ? (
              <button
                type="button"
                className="btn-info"
                onClick={() => void startInspectAs("INSPECTOR")}
              >
                {canClaimInspectorInIn ? "我以檢驗者接鎖" : "我以驗收者接續"}
              </button>
            ) : null}
            {canClaimInspectorResume && (
              <button
                type="button"
                className="btn-info"
                onClick={() => void startInspectAs("INSPECTOR")}
              >
                接鎖繼續驗收
              </button>
            )}
          </div>
        </div>
      )}
      <div className="panel panel-body text-sm space-y-3">
        <div className="inspect-toolbar">
          <div className="min-w-0 shrink-0">
            <div className="font-mono text-lg break-all sm:text-xl">{doc.documentNumber}</div>
            <div className="text-muted-foreground">{statusLabel(doc)}</div>
          </div>
          <div className="inspect-toolbar-actions">
            <Link href="/documents" className="btn-secondary">
              返回列表
            </Link>
            {!shipped &&
              !completed &&
              doc.status === DocumentStatus.INSPECTING &&
              inspectorLikeEditing && (
              <div className="toolbar">
                <div className="field">
                  <label className="field-label whitespace-nowrap">箱數 A（小件）</label>
                  <input
                    className="input-qty"
                    value={packageCountA}
                    inputMode="numeric"
                    onChange={(e) => setPackageCountA(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label whitespace-nowrap">C（大件）</label>
                  <input
                    className="input-qty"
                    value={packageCountC}
                    inputMode="numeric"
                    onChange={(e) => setPackageCountC(e.target.value)}
                  />
                </div>
              </div>
            )}
            {completed && !shipped && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => openPrintTab()}
              >
                列印
              </button>
            )}
            {canStock && completed && !shipped && doc.flow === "IN" && !stocked && (
              <button
                type="button"
                className="btn-success"
                onClick={async () => {
                  if (!window.confirm("確認已完成上架，標記此單據已入庫？")) return;
                  const res = await fetch(`/api/documents/${id}/stock`, {
                    method: "POST",
                    credentials: "include",
                  });
                  if (!res.ok) {
                    const t = await res.text();
                    try {
                      const j = JSON.parse(t) as { error?: string };
                      setErr(j.error ?? t);
                    } catch {
                      setErr(t);
                    }
                    return;
                  }
                  setErr(null);
                  setDoc(await res.json());
                }}
              >
                已完成上架（入庫）
              </button>
            )}
            {canDeleteDoc && (
              <button
                type="button"
                className="btn-destructive"
                onClick={() => void removeDoc()}
              >
                刪除單據
              </button>
            )}
            {canInspect &&
              !salesCannotInspectIn &&
              doc.status === DocumentStatus.PENDING && (
              <button
                type="button"
                className="btn-warning"
                onClick={() =>
                  doc.flow === "IN"
                    ? void startInspectAs("INSPECTOR")
                    : setInspectRoleModal(true)
                }
              >
                驗收
              </button>
            )}
            {showHandoffToInspector && (
              <button
                type="button"
                className="btn-info"
                onClick={() => void releaseHandoff()}
              >
                揀貨完成，交驗收
              </button>
            )}
            {canCancelInspect && (
              <button
                type="button"
                className="btn-warn-outline"
                onClick={() => void cancelInspect()}
              >
                取消驗收
              </button>
            )}
            {showCompleteWithInspector && (
              <button
                type="button"
                className="btn-success"
                onClick={() => void completeInspect("with-inspector")}
              >
                儲存並完成單據
              </button>
            )}
            {showCompletePickerOnly && (
              <button
                type="button"
                className="btn-success-outline"
                onClick={() => void completeInspect("picker-only")}
              >
                儲存並完成（略過驗收）
              </button>
            )}
            {canUnlock &&
              unlockAllowedByFlow &&
              doc.status !== DocumentStatus.SHIPPED &&
              (doc.status === DocumentStatus.INSPECTING ||
                doc.status === DocumentStatus.COMPLETED) &&
              !(role === Role.WAREHOUSE_SUPERVISOR && stocked) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void unlock()}
              >
                解鎖（補驗收）
              </button>
            )}
          </div>
        </div>
        {showShip && (
          <div className="inspect-ship-panel">
            <p className="text-xs font-medium text-muted-foreground">出貨／物流</p>
            <div className="inspect-ship-grid">
              <div className="field col-span-2 sm:col-span-2 lg:col-span-2">
                <label className="field-label">物流單號</label>
                <input
                  className="ui-input"
                  value={logisticsNo}
                  onChange={(e) => setLogisticsNo(e.target.value.replace(/\s+/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void ship();
                  }}
                  placeholder={
                    noLogisticsInput
                      ? selfPickup
                        ? "自取（不需填寫）"
                        : "倉庫親送（不需填寫）"
                      : "可重複"
                  }
                  disabled={noLogisticsInput}
                />
              </div>
              <div className="field">
                <span className="field-label invisible select-none" aria-hidden>
                  掃描
                </span>
                <button
                  type="button"
                  className="btn-secondary w-full"
                  onClick={() => setCamTarget("logistics")}
                  disabled={noLogisticsInput}
                >
                  鏡頭掃描
                </button>
              </div>
              <div className="field flex flex-col justify-end gap-2 col-span-2 sm:col-span-1">
                <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={selfPickup}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelfPickup(checked);
                      if (checked) {
                        setWarehouseDelivery(false);
                        setLogisticsNo("");
                        autoShipLnRef.current = "";
                      }
                    }}
                  />
                  自取
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={warehouseDelivery}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setWarehouseDelivery(checked);
                      if (checked) {
                        setSelfPickup(false);
                        setLogisticsNo("");
                        autoShipLnRef.current = "";
                      }
                    }}
                  />
                  倉庫親送
                </label>
              </div>
              <div className="field">
                <label className="field-label">A（小件）</label>
                <input
                  className="input-qty w-full max-w-none"
                  value={packageCountA}
                  inputMode="numeric"
                  onChange={(e) => setPackageCountA(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">C（大件）</label>
                <input
                  className="input-qty w-full max-w-none"
                  value={packageCountC}
                  inputMode="numeric"
                  onChange={(e) => setPackageCountC(e.target.value)}
                />
              </div>
              <div className="field col-span-2 sm:col-span-2">
                <label className="field-label">備註（選填）</label>
                <input
                  className="ui-input"
                  value={packageSize}
                  onChange={(e) => setPackageSize(e.target.value)}
                  placeholder="例：60x40x40"
                />
              </div>
              <div className="field col-span-2 sm:col-span-1 flex flex-col justify-end">
                <button
                  type="button"
                  className="btn-primary w-full"
                  onClick={() => void ship()}
                  disabled={shipping}
                >
                  {shipping ? "出貨中…" : "出貨"}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              箱數 A {Number(packageCountA) || 0} / C {Number(packageCountC) || 0}
              {noLogisticsInput ? "（自取／親送時 A/C 僅作紀錄）" : ""}
            </p>
          </div>
        )}
        <hr className="border-border" />
        <p>
          類型 {doc.documentType} ／ {flowZh[doc.flow] ?? "—"} ／ 部門{" "}
          {doc.department.name} ／ 單據日期{" "}
          {new Date(doc.documentDate ?? doc.createdAt).toLocaleDateString(
            "zh-TW",
            {
              year: "numeric",
              month: "numeric",
              day: "numeric",
            },
          )}
        </p>
        {doc.flow === "IN" ? (
          <p className="text-xs text-muted-foreground">
            檢驗者 {doc.inspector?.name ?? "—"}
          </p>
        ) : shipped ? (
          <p className="text-xs text-muted-foreground">
            揀貨者 {doc.picker?.name ?? "—"} ／ 驗收者 {doc.inspector?.name ?? "—"}
            {" ／ 出貨時間 "}
            {doc.shippedAt
              ? new Date(doc.shippedAt).toLocaleString()
              : `—（舊單據，更新 ${new Date(doc.updatedAt).toLocaleString()}）`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            揀貨者 {doc.picker?.name ?? "—"} ／ 驗收者 {doc.inspector?.name ?? "—"}
          </p>
        )}
        <p>
          凌越 {doc.lingyueCode ?? "—"} ／ 通路 {doc.channelCode ?? "—"} ／ 名稱{" "}
          {doc.counterpartyName ?? "—"}
        </p>
        <p>
          電話 {doc.phone ?? "—"} ／ 地址 {doc.address ?? "—"} ／ 製單{" "}
          {doc.creatorName ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          更新 {new Date(doc.updatedAt).toLocaleString()}
        </p>
        {(doc.status === DocumentStatus.COMPLETED ||
            doc.status === DocumentStatus.SHIPPED) && (
            <p className="text-xs text-muted-foreground">
              {doc.flow === "OUT" && (
                <>
                  {doc.logisticsNo?.trim()
                    ? doc.logisticsNo.trim() === LOGISTICS_SELF_PICKUP
                      ? "自取"
                      : doc.logisticsNo.trim() === LOGISTICS_WAREHOUSE_DELIVERY
                        ? "倉庫親送"
                        : `物流單號 ${doc.logisticsNo.trim()}`
                    : "物流單號 —"}
                  {" ／ "}
                </>
              )}
              箱數 {doc.packageCountA ?? 0} A ／ {doc.packageCountC ?? 0} C
              {doc.packageSize?.trim() ? ` ／ 備註 ${doc.packageSize}` : ""}
            </p>
          )}

        {!shipped && !completed && doc.status === DocumentStatus.INSPECTING && (
          <p className="text-xs text-muted-foreground pt-2">
            {doc.flow === "IN" ? (
              doc.inspector ? (
                <>
                  驗收核對方式（依檢驗者操作自動判定）：
                  {doc.acceptMethod === AcceptMethod.MANUAL
                    ? "手動核對（曾手改驗收量）"
                    : "條碼核對（以掃碼／條碼累加為主）"}
                </>
              ) : (
                <>尚未登記檢驗者，請接鎖開始驗收。</>
              )
            ) : pickerPicking ? (
              <>
                揀貨中：請勾選「揀過」表示已揀出該列；驗收量由驗收者接鎖後核對（手打為手動核對、掃條碼為條碼核對）。
              </>
            ) : doc.inspector ? (
              <>
                驗收核對方式（依驗收者操作自動判定）：
                {doc.acceptMethod === AcceptMethod.MANUAL
                  ? "手動核對（曾手改驗收量）"
                  : "條碼核對（以掃碼／條碼累加為主）"}
              </>
            ) : (
              <>驗收尚未開始；揀貨完成後請交驗收。</>
            )}
          </p>
        )}
      </div>

      {!shipped &&
        inspectorLikeEditing && (
          <div className="panel panel-body space-y-2">
            <p className="text-sm font-medium text-foreground">條碼驗收</p>
            <div className="filter-bar !grid-cols-2 sm:!grid-cols-4">
              <div className="field field-wide sm:col-span-2">
                <label className="field-label">條碼／貨號</label>
                <input
                  className="ui-input"
                  placeholder="條碼／貨號"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && bumpLineByCode(manualCode)
                  }
                />
              </div>
              <div className="field">
                <label className="field-label">累加數量</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-qty w-full max-w-none"
                  value={barcodeBumpQty}
                  onChange={(e) => setBarcodeBumpQty(e.target.value)}
                  title="每次掃描或按累加時要加上的驗收量，預設 1"
                />
              </div>
              <div className="toolbar-stretch !col-span-2 sm:!col-span-4">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => bumpLineByCode(manualCode)}
                >
                  累加
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCamTarget("line")}
                >
                  鏡頭掃描
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              鏡頭掃描也會使用上方「累加數量」。核對無誤後按「儲存並完成單據」。
            </p>
          </div>
        )}

      {!shipped && inspectorLikeEditing && (
        <p className="text-sm text-muted-foreground">
          可掃條碼／貨號累加（標為條碼核對）或直接修改下方驗收量（標為手動核對）。
        </p>
      )}

      <InspectProgress
        heading={pickerPicking ? "揀貨進度" : "驗收進度"}
        totalDone={totalDone}
        totalLines={doc.lines.length}
        totalInspectQty={totalInspectQty}
        totalDocQty={totalDocQty}
        progressPct={progressPct}
      />

      <LineItemsView
        lines={linesSorted}
        lineMode={lineItemsMode}
        doc={doc}
        setDoc={setDoc}
        savePatch={savePatch}
      />

      {camTarget && (
        <BarcodeCamera
          onDecoded={(t) => {
            const decoded = t.trim().replace(/\s+/g, "");
            if (camTarget === "logistics") {
              setSelfPickup(false);
              setWarehouseDelivery(false);
              setLogisticsNo(decoded);
              autoShipLnRef.current = "";
              setErr(null);
              return;
            }
            bumpLineByCode(decoded);
          }}
          onClose={() => setCamTarget(null)}
        />
      )}

      {inspectRoleModal && (
        <InspectRoleModal
          userName={session?.user?.name?.trim() || session?.user?.username || ""}
          salesPickerOnly={salesPickerOnly}
          onSelect={(r) => void startInspectAs(r)}
          onClose={() => setInspectRoleModal(false)}
        />
      )}
    </div>
  );
}

