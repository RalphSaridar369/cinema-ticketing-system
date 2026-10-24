"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAppState, type AppState } from "@/lib/store";

// Renders children only once the client store is loaded and the user is logged
// in; otherwise sends them to the login page.
export function RequireAuth({ children, fallback }: { children: (s: AppState) => ReactNode; fallback: ReactNode }) {
  const s = useAppState();
  const router = useRouter();
  const out = s && !s.authed;
  useEffect(() => {
    if (out) router.replace("/login");
  }, [out, router]);
  if (!s || !s.authed) return fallback;
  return children(s);
}

export function RedirectIfAuthed() {
  const s = useAppState();
  const router = useRouter();
  const authed = !!s?.authed;
  useEffect(() => {
    if (authed) router.replace("/");
  }, [authed, router]);
  return null;
}
