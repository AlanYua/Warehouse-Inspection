"use client";

export default function InspectRoleModal({
  userName,
  salesPickerOnly,
  onSelect,
  onClose,
}: {
  userName: string;
  salesPickerOnly: boolean;
  onSelect: (role: "PICKER" | "INSPECTOR") => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspect-role-title"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="w-full max-w-sm max-h-[min(90dvh,36rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="inspect-role-title" className="font-medium text-foreground">
          選擇驗收身份
        </h2>
        <p className="mt-2 text-xs text-foreground">
          目前登入：
          <span className="font-medium">{userName || "—"}</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          選擇後會把<strong className="text-foreground">目前這位登入者</strong>
          寫入「揀貨者」或「驗收者」。
          <strong className="text-foreground">同一人同時只能鎖定一張驗收中單據</strong>
          ，揀貨者鎖定後請勿再開其他未完成單，須先「揀貨完成，交驗收」或略過完成。
          揀貨者：逐列勾選「揀過」後交驗收（不可手改驗收量）。驗收者：手改驗收量為手動核對，掃條碼／貨號累加為條碼核對；核對完按「儲存並完成單據」。
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90"
            onClick={() => onSelect("PICKER")}
          >
            我是揀貨者
          </button>
          {!salesPickerOnly && (
            <button
              type="button"
              className="text-sm px-3 py-2 rounded-md border border-input bg-background shadow-sm hover:bg-accent"
              onClick={() => onSelect("INSPECTOR")}
            >
              我是驗收者
            </button>
          )}
          <button
            type="button"
            className="text-sm px-3 py-1 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
