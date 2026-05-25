/**
 * 閒置 2 小時自動登出：監聽操作並定期同步 lastActivity 至 JWT。
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { SESSION_IDLE_MS } from "@/lib/session-idle";

const CHECK_MS = 60_000;
const PING_MS = 2 * 60_000;
const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "mousemove",
] as const;

export function IdleLogout() {
  const { status, update } = useSession();
  const pathname = usePathname();
  const lastActivity = useRef(0);
  const lastPing = useRef(0);

  const recordActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const signOutIdle = useCallback(() => {
    void signOut({ callbackUrl: "/login?reason=idle" });
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || pathname.startsWith("/login")) return;

    lastActivity.current = Date.now();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, recordActivity, { passive: true });
    }

    const checkId = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= SESSION_IDLE_MS) {
        signOutIdle();
      }
    }, CHECK_MS);

    const pingId = window.setInterval(() => {
      const now = Date.now();
      if (now - lastActivity.current >= SESSION_IDLE_MS) return;
      if (now - lastPing.current < PING_MS) return;
      lastPing.current = now;
      void update({ lastActivity: now });
    }, PING_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, recordActivity);
      }
      window.clearInterval(checkId);
      window.clearInterval(pingId);
    };
  }, [status, pathname, recordActivity, signOutIdle, update]);

  return null;
}
