"use client";

import { useEffect, useState } from "react";
import {
  getConfirmPasswordPending,
  resolveConfirmPassword,
  subscribeConfirmPassword,
} from "@/lib/confirm-password-client";

export function ConfirmPasswordHost() {
  const [, tick] = useState(0);
  const [password, setPassword] = useState("");

  useEffect(() => subscribeConfirmPassword(() => tick((n) => n + 1)), []);

  const pending = getConfirmPasswordPending();
  if (!pending) return null;

  function cancel() {
    setPassword("");
    resolveConfirmPassword(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = password.trim();
    if (!pw) return;
    setPassword("");
    resolveConfirmPassword(pw);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-password-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl space-y-4"
      >
        <div>
          <h2
            id="confirm-password-title"
            className="text-base font-semibold text-foreground"
          >
            {pending.title}
          </h2>
          {pending.description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {pending.description}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="confirm-password-input" className="field-label">
            目前登入密碼
          </label>
          <input
            id="confirm-password-input"
            type="password"
            autoFocus
            autoComplete="current-password"
            className="ui-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={cancel}>
            取消
          </button>
          <button type="submit" className="btn-primary">
            確認
          </button>
        </div>
      </form>
    </div>
  );
}
