"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAppState, type AppState } from "@/lib/store";

// Renders children only once the Supabase session has loaded and the user is
// logged in; otherwise sends them to the login page.
export function RequireAuth({ children, fallback }: { children: (s: AppState) => ReactNode; fallback: ReactNode }) {
  const s = useAppState();
  const router = useRouter();
  const out = s?.authReady && !s.authed;
  useEffect(() => {
    if (out) router.replace("/login");
  }, [out, router]);
  if (!s || !s.authed) return fallback;
  return children(s);
}

// The reset link signs the user in with a recovery session, so that page must
// stay reachable while logged in.
const OPEN_WHEN_AUTHED = ["/reset-password"];

export function RedirectIfAuthed() {
  const s = useAppState();
  const router = useRouter();
  const path = usePathname();
  const leave = !!s?.authed && !OPEN_WHEN_AUTHED.includes(path);
  useEffect(() => {
    if (leave) router.replace("/");
  }, [leave, router]);
  return null;
}
