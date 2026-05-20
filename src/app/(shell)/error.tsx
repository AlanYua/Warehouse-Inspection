"use client";

export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-2xl font-semibold text-destructive">發生錯誤</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "系統發生未預期的錯誤，請稍後再試。"}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow hover:bg-primary/90"
        >
          重試
        </button>
      </div>
    </div>
  );
}
