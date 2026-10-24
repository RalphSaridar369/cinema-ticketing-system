import { Suspense } from "react";
import { Tickets } from "@/components/screens/tickets";
import { ScreenFallback } from "@/components/ui";

export default function TicketsPage({ params, searchParams }: PageProps<"/tickets/[ref]">) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Tickets params={params} searchParams={searchParams} />
    </Suspense>
  );
}
