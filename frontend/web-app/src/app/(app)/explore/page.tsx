import { Suspense } from "react";
import { Explore } from "@/components/screens/explore";
import { ScreenFallback } from "@/components/ui";

export default function ExplorePage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Explore />
    </Suspense>
  );
}
