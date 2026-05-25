/**
 * Client 包一層 next-auth SessionProvider，並定期 refetch session。
 */
"use client";

import { SessionProvider } from "next-auth/react";
import { ConfirmPasswordHost } from "@/components/ConfirmPasswordHost";
import { IdleLogout } from "@/components/IdleLogout";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={60 * 5}>
      <ConfirmPasswordHost />
      <IdleLogout />
      {children}
    </SessionProvider>
  );
}
