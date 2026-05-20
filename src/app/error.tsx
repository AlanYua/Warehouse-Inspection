"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-4xl font-bold text-destructive">發生錯誤</h1>
        <p className="text-muted-foreground">
          {error.message || "系統發生未預期的錯誤，請稍後再試。"}
        </p>
        <button
          onClick={reset}
          className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow hover:bg-primary/90"
        >
          重試
        </button>
      </div>
    </div>
  );
}
