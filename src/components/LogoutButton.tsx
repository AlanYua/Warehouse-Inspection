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
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      登出
    </button>
  );
}
