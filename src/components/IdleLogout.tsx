/**
 * 閒置 30 分鐘自動登出：監聽操作並定期同步 lastActivity 至 JWT。
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  SESSION_IDLE_MS,
  effectiveLastActivityMs,
  isSessionIdleExpired,
} from "@/lib/session-idle";

const CHECK_MS = 30_000;
const PING_MS = 60_000;
const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
] as const;

function effectiveIdleAnchor(
  localMs: number,
  serverLastActivity: unknown,
): number {
  return Math.max(localMs, effectiveLastActivityMs(serverLastActivity));
}

export function IdleLogout() {
  const { data: session, status, update } = useSession();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const lastActivity = useRef(0);
  const lastPing = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const recordActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const signOutIdle = useCallback(() => {
    void (async () => {
      try {
        await fetch("/api/auth/session-event", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "idle" }),
        });
      } catch {
        /* 仍執行登出 */
      }
      await signOut({ callbackUrl: "/login?reason=idle" });
    })();
  }, []);

  const shouldForceIdleSignOut = useCallback(() => {
    const s = sessionRef.current;
    if (!s?.user?.id) return true;
    const expiresMs = s.expires ? new Date(s.expires).getTime() : NaN;
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return true;
    return isSessionIdleExpired(s.lastActivity);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      lastActivity.current = 0;
      lastPing.current = 0;
    }
  }, [status]);

  const checkIdle = useCallback(() => {
    if (pathnameRef.current.startsWith("/login")) return;
    if (shouldForceIdleSignOut()) {
      signOutIdle();
      return;
    }
    const anchor = effectiveIdleAnchor(
      lastActivity.current,
      sessionRef.current?.lastActivity,
    );
    if (Date.now() - anchor >= SESSION_IDLE_MS) {
      signOutIdle();
    }
  }, [shouldForceIdleSignOut, signOutIdle]);

  useEffect(() => {
    if (status !== "authenticated" || pathname.startsWith("/login")) return;

    const serverMs = effectiveLastActivityMs(session?.lastActivity);
    if (lastActivity.current === 0) {
      lastActivity.current = serverMs > 0 ? serverMs : Date.now();
    } else if (serverMs > lastActivity.current) {
      lastActivity.current = serverMs;
    }

    if (shouldForceIdleSignOut()) {
      signOutIdle();
      return;
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, recordActivity, { passive: true });
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") checkIdle();
    };
    document.addEventListener("visibilitychange", onVisible);

    const checkId = window.setInterval(checkIdle, CHECK_MS);

    const pingId = window.setInterval(() => {
      const now = Date.now();
      const anchor = effectiveIdleAnchor(
        lastActivity.current,
        sessionRef.current?.lastActivity,
      );
      if (now - anchor >= SESSION_IDLE_MS) return;
      if (now - lastPing.current < PING_MS) return;
      lastPing.current = now;
      void update({ lastActivity: lastActivity.current });
    }, PING_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, recordActivity);
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(checkId);
      window.clearInterval(pingId);
    };
  }, [
    status,
    session?.lastActivity,
    session?.user?.id,
    session?.expires,
    pathname,
    recordActivity,
    signOutIdle,
    shouldForceIdleSignOut,
    checkIdle,
    update,
  ]);

  return null;
}
