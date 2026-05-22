/**
 * 登入頁
 * 檔案：src/app/login/page.tsx
 */

"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const idleMsg =
    searchParams.get("reason") === "idle"
      ? "已超過 1 小時未操作，請重新登入"
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!username.trim()) { setErr("請輸入帳號"); return; }
    if (!password) { setErr("請輸入密碼"); return; }
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-muted/50 via-background to-muted/30">
      <form
        onSubmit={onSubmit}
        className="panel w-full max-w-md space-y-5 p-6 sm:p-8 shadow-md"
      >
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Warehouse
          </p>
          <h1 className="page-title text-center text-2xl sm:text-3xl">倉庫驗收系統</h1>
        </div>
        {idleMsg && (
          <p className="text-sm text-amber-700 dark:text-amber-400 text-center">
            {idleMsg}
          </p>
        )}
        {err && (
          <p className="text-sm text-destructive text-center">{err}</p>
        )}
        <div className="field">
          <label htmlFor="login-username" className="field-label">
            帳號
          </label>
          <input
            id="login-username"
            required
            className="ui-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
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
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full min-h-10"
        >
          {loading ? "…" : "登入"}
        </button>
        </form>
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
