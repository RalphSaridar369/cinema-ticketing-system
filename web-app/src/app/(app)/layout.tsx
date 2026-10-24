import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ScreenFallback } from "@/components/ui";

// The shell reads the pathname and client-only state, so it streams in after
// the static prerender.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
