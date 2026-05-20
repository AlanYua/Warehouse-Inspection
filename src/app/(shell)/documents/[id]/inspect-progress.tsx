"use client";

export default function InspectProgress({
  heading = "驗收進度",
  totalDone,
  totalLines,
  totalInspectQty,
  totalDocQty,
  progressPct,
}: {
  heading?: string;
  totalDone: number;
  totalLines: number;
  totalInspectQty: number;
  totalDocQty: number;
  progressPct: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-muted-foreground">{heading}</span>
        <span className="font-medium tabular-nums">
          {totalDone}/{totalLines} 品項完成
          <span className="text-muted-foreground ml-2">
            ({totalInspectQty}/{totalDocQty} PCS · {progressPct}%)
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            progressPct >= 100
              ? "bg-emerald-500"
              : progressPct > 0
                ? "bg-sky-500"
                : "bg-muted-foreground/20"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
