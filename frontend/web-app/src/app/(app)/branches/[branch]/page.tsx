import { Suspense } from "react";
import { BranchMovies } from "@/components/screens/branch-movies";
import { ScreenFallback } from "@/components/ui";

export default function BranchPage({ params }: PageProps<"/branches/[branch]">) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <BranchMovies params={params} />
    </Suspense>
  );
}
