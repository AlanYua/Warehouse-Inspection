"use client";

import { AcceptMethod } from "@prisma/client";
import type { Line, Doc } from "./inspect-types";

export type LineItemsLineMode = "picker" | "inspector" | "readonly";

function LineQtyInput({
  line: l,
  editable,
  doc,
  setDoc,
  savePatch,
  applyManualAcceptForInspectQty,
  mobile,
}: {
  line: Line;
  editable: boolean;
  doc: Doc;
  setDoc: React.Dispatch<React.SetStateAction<Doc | null>>;
  savePatch: (body: unknown) => Promise<void>;
  applyManualAcceptForInspectQty: boolean;
  mobile?: boolean;
}) {
  return (
    <input
      type="number"
      className={
        mobile
          ? "w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-lg font-semibold tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : "w-20 rounded-md border border-input bg-background px-1 py-0.5 text-right text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
      disabled={!editable}
      value={l.inspectQuantity}
      onChange={(e) => {
        const v = Number(e.target.value);
        setDoc((d) =>
          d
            ? {
                ...d,
                lines: d.lines.map((x) =>
                  x.id === l.id ? { ...x, inspectQuantity: v } : x,
                ),
              }
            : d,
        );
      }}
      onBlur={() => {
        const cur = doc.lines.find((x) => x.id === l.id);
        if (!cur) return;
        if (cur.inspectQuantity > l.docQuantity) {
          const over = cur.inspectQuantity - l.docQuantity;
          window.alert(
            [
              "驗收量超過單據數量。",
              `品項：${l.productName}（${l.productCode}）`,
              `單據數：${l.docQuantity}　目前驗收：${cur.inspectQuantity}`,
              `超出：${over}`,
              `已改為驗收量 ${l.docQuantity}（以單據數量為上限）。`,
            ].join("\n"),
          );
          setDoc((d) =>
            d
              ? {
                  ...d,
                  lines: d.lines.map((x) =>
                    x.id === l.id
                      ? { ...x, inspectQuantity: l.docQuantity }
                      : x,
                  ),
                }
              : d,
          );
          void savePatch({
            ...(applyManualAcceptForInspectQty
              ? { acceptMethod: AcceptMethod.MANUAL }
              : {}),
            lines: [{ id: l.id, inspectQuantity: l.docQuantity }],
          });
          return;
        }
        void savePatch({
          ...(applyManualAcceptForInspectQty
            ? { acceptMethod: AcceptMethod.MANUAL }
            : {}),
          lines: [{ id: l.id, inspectQuantity: cur.inspectQuantity }],
        });
      }}
    />
  );
}

function PickedToggle({
  line: l,
  editable,
  doc,
  setDoc,
  savePatch,
}: {
  line: Line;
  editable: boolean;
  doc: Doc;
  setDoc: React.Dispatch<React.SetStateAction<Doc | null>>;
  savePatch: (body: unknown) => Promise<void>;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
      <input
        type="checkbox"
        className="accent-primary h-4 w-4 shrink-0"
        checked={Boolean(l.pickerPicked)}
        disabled={!editable}
        onChange={(e) => {
          const checked = e.target.checked;
          setDoc((d) =>
            d
              ? {
                  ...d,
                  lines: d.lines.map((x) =>
                    x.id === l.id ? { ...x, pickerPicked: checked } : x,
                  ),
                }
              : d,
          );
          void savePatch({ lines: [{ id: l.id, pickerPicked: checked }] });
        }}
      />
      <span className="text-xs text-muted-foreground">揀過</span>
    </label>
  );
}

export default function LineItemsView({
  lines,
  lineMode,
  doc,
  setDoc,
  savePatch,
}: {
  lines: Line[];
  lineMode: LineItemsLineMode;
  doc: Doc;
  setDoc: React.Dispatch<React.SetStateAction<Doc | null>>;
  savePatch: (body: unknown) => Promise<void>;
}) {
  const editable = lineMode !== "readonly";
  const isPicker = lineMode === "picker";
  const applyManualAcceptForInspectQty =
    lineMode === "inspector" && doc.inspector != null;

  return (
    <>
      {/* 桌面表格 (md+) */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left p-2">貨號</th>
              <th className="text-left p-2">條碼</th>
              <th className="text-left p-2">品名</th>
              <th className="text-right p-2">單據量</th>
              <th className="text-right p-2">驗收量</th>
              {isPicker && <th className="text-center p-2 w-24">揀貨</th>}
              <th className="text-left p-2">儲位</th>
              <th className="text-left p-2">備註</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const done = isPicker
                ? Boolean(l.pickerPicked)
                : l.inspectQuantity >= l.docQuantity;
              const partial =
                !isPicker && l.inspectQuantity > 0 && !done;
              return (
                <tr
                  key={l.id}
                  className={`border-t border-border ${
                    done
                      ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                      : partial
                        ? "bg-amber-50/50 dark:bg-amber-950/15"
                        : ""
                  }`}
                >
                  <td className="p-2 font-mono">{l.productCode}</td>
                  <td className="p-2 font-mono text-xs">{l.barcode}</td>
                  <td className="p-2">{l.productName}</td>
                  <td className="p-2 text-right tabular-nums">{l.docQuantity}</td>
                  <td className="p-2 text-right">
                    {isPicker ? (
                      <span className="tabular-nums text-muted-foreground">
                        {l.inspectQuantity}
                      </span>
                    ) : (
                      <LineQtyInput
                        line={l}
                        editable={editable}
                        doc={doc}
                        setDoc={setDoc}
                        savePatch={savePatch}
                        applyManualAcceptForInspectQty={
                          applyManualAcceptForInspectQty
                        }
                      />
                    )}
                  </td>
                  {isPicker && (
                    <td className="p-2 text-center">
                      <PickedToggle
                        line={l}
                        editable={editable}
                        doc={doc}
                        setDoc={setDoc}
                        savePatch={savePatch}
                      />
                    </td>
                  )}
                  <td className="p-2 text-muted-foreground">{l.storageLocation ?? ""}</td>
                  <td className="p-2">
                    <input
                      className="w-40 rounded-md border border-input bg-background px-1 py-0.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={!editable}
                      defaultValue={l.remark ?? ""}
                      onBlur={(e) =>
                        void savePatch({
                          lines: [{ id: l.id, remark: e.target.value || null }],
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 手機卡片 (<md) */}
      <div className="md:hidden space-y-2">
        {lines.map((l) => {
          const done = isPicker
            ? Boolean(l.pickerPicked)
            : l.inspectQuantity >= l.docQuantity;
          const partial =
            !isPicker && l.inspectQuantity > 0 && !done;
          return (
            <div
              key={l.id}
              className={`rounded-xl border p-3 shadow-xs ${
                done
                  ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : partial
                    ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/25"
                    : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-medium text-sm leading-snug">
                  {l.productName}
                </span>
                {done && (
                  <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                    ✓
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mb-2">
                <span className="font-mono">{l.productCode}</span>
                {l.barcode && (
                  <span className="font-mono">{l.barcode}</span>
                )}
                {l.storageLocation && (
                  <span>儲位 {l.storageLocation}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">單據</span>
                  <span className="text-lg font-semibold tabular-nums">{l.docQuantity}</span>
                </div>
                <span className="text-muted-foreground">/</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">驗收</span>
                  {isPicker ? (
                    <span className="text-lg font-semibold tabular-nums text-muted-foreground">
                      {l.inspectQuantity}
                    </span>
                  ) : (
                    <LineQtyInput
                      line={l}
                      editable={editable}
                      doc={doc}
                      setDoc={setDoc}
                      savePatch={savePatch}
                      applyManualAcceptForInspectQty={
                        applyManualAcceptForInspectQty
                      }
                      mobile
                    />
                  )}
                </div>
                {isPicker && (
                  <PickedToggle
                    line={l}
                    editable={editable}
                    doc={doc}
                    setDoc={setDoc}
                    savePatch={savePatch}
                  />
                )}
              </div>

              {(editable || l.remark) && (
                <div className="mt-2">
                  <input
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={!editable}
                    defaultValue={l.remark ?? ""}
                    placeholder="備註"
                    onBlur={(e) =>
                      void savePatch({
                        lines: [{ id: l.id, remark: e.target.value || null }],
                      })
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
