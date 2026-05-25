/**
 * 登入頁
 * 檔案：src/app/login/page.tsx
 */

"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { SiteCopyright } from "@/components/SiteCopyright";
import { SESSION_IDLE_LABEL } from "@/lib/session-idle";

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const idleMsg =
    searchParams.get("reason") === "idle"
      ? `已超過 ${SESSION_IDLE_LABEL} 未操作，請重新登入`
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!username.trim()) {
      setErr("請輸入帳號");
      return;
    }
    if (!password) {
      setErr("請輸入密碼");
      return;
    }
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      setLoading(false);
      if (res?.error) {
        setErr("帳號或密碼錯誤");
        return;
      }
      window.location.href = "/";
    } catch {
      setLoading(false);
      setErr("無法連線至伺服器，請稍後再試");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 via-background to-slate-200/60 dark:from-slate-950 dark:via-background dark:to-slate-900/80">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="h-7 w-7"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 9.5 12 4l9 5.5M5 10v8.5h14V10M9 18.5V13h6v5.5"
                />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Warehouse Inspection
            </h1>
            <p className="text-sm text-muted-foreground">
              倉庫驗收／驗出管理系統
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="panel space-y-5 p-6 sm:p-8 shadow-lg border border-border/80"
          >
            {(idleMsg || err) && (
              <div
                role="alert"
                className={`rounded-lg border px-3 py-2.5 text-sm text-center ${
                  idleMsg
                    ? "border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                {idleMsg ?? err}
              </div>
            )}

            <div className="field">
              <label htmlFor="login-username" className="field-label">
                帳號
              </label>
              <input
                id="login-username"
                required
                autoFocus
                className="ui-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="請輸入帳號"
                disabled={loading}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password" className="field-label">
                密碼
              </label>
              <input
                id="login-password"
                type="password"
                required
                className="ui-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="請輸入密碼"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full min-h-11 text-base font-medium"
            >
              {loading ? "登入中…" : "登入"}
            </button>
          </form>
        </div>
      </div>

      <footer className="shrink-0 px-4 pb-6 pt-2">
        <SiteCopyright />
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
