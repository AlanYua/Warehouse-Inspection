/**
 * 全站共用：敏感操作前請使用者輸入目前登入密碼。
 */
"use client";

type Pending = {
  title: string;
  description?: string;
  resolve: (password: string | null) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

export function subscribeConfirmPassword(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConfirmPasswordPending(): Pending | null {
  return pending;
}

export function resolveConfirmPassword(password: string | null): void {
  const p = pending;
  pending = null;
  listeners.forEach((l) => l());
  p?.resolve(password);
}

export function requestConfirmPassword(opts: {
  title: string;
  description?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    pending = { ...opts, resolve };
    listeners.forEach((l) => l());
  });
}
