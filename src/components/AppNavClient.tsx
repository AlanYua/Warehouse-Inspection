/**
 * 響應式頂部導覽：lg 以下為漢堡選單＋抽屜，lg 以上維持橫列。
 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";

const linkCls =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-accent/80 hover:text-accent-foreground";

const drawerLinkCls =
  "block w-full text-left text-base font-medium text-foreground px-3 py-3 rounded-lg hover:bg-accent/80";

type NavItem = { href: string; label: string };

type Props = {
  items: NavItem[];
  userBadge: string;
};

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function AppNavClient({ items, userBadge }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3 min-h-[3.25rem]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link href="/" className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold tracking-wide text-muted-foreground hover:bg-accent/80 transition-colors">
              Warehouse
            </Link>
            <button
              type="button"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-xs hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={open ? "關閉選單" : "開啟選單"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <CloseIcon /> : <MenuIcon />}
            </button>
            <nav
              className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-1 xl:gap-2 min-w-0"
              aria-label="主要導覽"
            >
              {items.map((it) => (
                <Link key={it.href} className={linkCls} href={it.href}>
                  {it.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 text-sm text-muted-foreground shrink-0">
            <span
              className="hidden sm:inline-block max-w-[12rem] md:max-w-[16rem] truncate rounded-lg border border-border/80 bg-card px-2.5 py-1 text-xs sm:text-sm"
              title={userBadge}
            >
              {userBadge}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {open && (
        <>
          <button
            type="button"
            className="lg:hidden fixed inset-0 z-[60] bg-black/40"
            aria-label="關閉選單"
            onClick={close}
          />
          <div
            id={panelId}
            className="lg:hidden fixed inset-y-0 left-0 z-[70] w-[min(100vw-3rem,18rem)] border-r border-border bg-background shadow-xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="選單"
          >
            <div className="flex items-center justify-between gap-2 p-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">選單</span>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
                aria-label="關閉"
                onClick={close}
              >
                <CloseIcon />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2" aria-label="主要導覽">
              {items.map((it) => (
                <Link
                  key={it.href}
                  className={drawerLinkCls}
                  href={it.href}
                  onClick={close}
                >
                  {it.label}
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-border text-xs text-muted-foreground break-words">
              {userBadge}
            </div>
          </div>
        </>
      )}
    </>
  );
}
