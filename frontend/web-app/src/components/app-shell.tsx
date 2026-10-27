"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { branchById, useCatalog } from "@/lib/catalog";
import { useAppState, type AppState } from "@/lib/store";
import { RequireAuth } from "./auth-gate";
import { BranchPill } from "./branch-picker";
import { Spinner, Wordmark } from "./ui";

type Tab = "Home" | "Book" | "My Tickets" | "Profile";

function activeTab(path: string): Tab | null {
  if (path === "/") return "Home";
  if (/^\/(branches|movies|book)/.test(path)) return "Book";
  if (/^\/(my-tickets|tickets)/.test(path)) return "My Tickets";
  if (path.startsWith("/profile")) return "Profile";
  return null;
}

// The selected branch's page, or the branch list until the catalogue has loaded.
export function useBookHref(s: AppState) {
  const c = useCatalog().data;
  const b = c ? branchById(c, s.branch) : null;
  return b ? `/branches/${b.slug}` : "/branches";
}
export const initials = (s: AppState) => (s.profile.first[0] ?? "") + (s.profile.last[0] ?? "");

function useTabs(s: AppState): [Tab, string][] {
  return [
    ["Home", "/"],
    ["Book", useBookHref(s)],
    ["My Tickets", "/my-tickets"],
    ["Profile", "/profile"],
  ];
}

function DesktopNav({ s, tab }: { s: AppState; tab: Tab | null }) {
  const tabs = useTabs(s);
  return (
    <header className="px-page sticky top-0 z-30 hidden h-[72px] flex-none items-center gap-11 border-b border-line bg-bg md:flex">
      <Link href="/">
        <Wordmark size={16} className="tracking-[.32em]" />
      </Link>
      <nav className="flex flex-1 gap-8 self-stretch">
        {tabs
          .filter(([l]) => l !== "Profile")
          .map(([l, href]) => (
            <Link
              key={l}
              href={href}
              aria-current={l === tab ? "page" : undefined}
              className={`flex items-center text-[15px] ${l === tab ? "font-bold shadow-[inset_0_-2px_0_var(--gold)]" : "text-mu hover:text-tx"}`}
            >
              {l}
            </Link>
          ))}
      </nav>
      <BranchPill s={s} />
      <Link
        href="/profile"
        aria-label="Profile"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-s3 text-sm font-bold"
      >
        {initials(s)}
      </Link>
    </header>
  );
}

function TabBar({ s, tab }: { s: AppState; tab: Tab | null }) {
  const tabs = useTabs(s);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[76px] border-t border-line bg-s1 pb-3 md:hidden">
      {tabs.map(([l, href]) => {
        const on = l === tab;
        return (
          <Link key={l} href={href} aria-current={on ? "page" : undefined} className="flex flex-1 flex-col items-center justify-center gap-1.5">
            <span className={`h-[3px] w-[22px] rounded-sm ${on ? "bg-gold" : ""}`} />
            <span className={`text-xs ${on ? "font-extrabold text-gold-ink" : "font-semibold text-mu"}`}>{l}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const tab = activeTab(path);
  return (
    <RequireAuth
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={32} />
        </div>
      }
    >
      {(s) => (
        <>
          <DesktopNav s={s} tab={tab} />
          <main className="flex flex-1 flex-col pb-[76px] md:pb-0">{children}</main>
          <TabBar s={s} tab={tab} />
        </>
      )}
    </RequireAuth>
  );
}

// For screens inside the shell, where the store is guaranteed to be loaded.
export function useApp(): AppState {
  const s = useAppState();
  if (!s) throw new Error("useApp must be used inside AppShell");
  return s;
}
