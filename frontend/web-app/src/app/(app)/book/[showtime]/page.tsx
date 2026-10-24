import { Suspense } from "react";
import { SeatSelection } from "@/components/screens/seat-selection";
import { ScreenFallback } from "@/components/ui";

export default function SeatsPage({ params }: PageProps<"/book/[showtime]">) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <SeatSelection params={params} />
    </Suspense>
  );
}
