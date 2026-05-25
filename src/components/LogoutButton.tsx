/**
 * 觸發 next-auth signOut，導回登入頁。
 */
"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      onClick={() => {
        void (async () => {
          try {
            await fetch("/api/auth/session-event", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "logout" }),
            });
          } catch {
            /* 仍執行登出 */
          }
          await signOut({ callbackUrl: "/login" });
        })();
      }}
    >
      登出
    </button>
  );
}
