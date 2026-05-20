/**
 * 登入頁
 * 檔案：src/app/login/page.tsx
 */

"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/40">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card text-card-foreground p-6 shadow-xs"
      >
        <h1 className="text-xl font-semibold text-center">Warehouse Inspection</h1>
        {err && (
          <p className="text-sm text-destructive text-center">{err}</p>
        )}
        <div>
          <label htmlFor="login-username" className="block text-xs text-muted-foreground mb-1">
            帳號
          </label>
          <input
            id="login-username"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-xs text-muted-foreground mb-1">
            密碼
          </label>
          <input
            id="login-password"
            type="password"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {loading ? "…" : "登入"}
        </button>
        </form>
    </div>
  );
}
