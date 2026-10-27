import { Suspense } from "react";
import { MovieDetails } from "@/components/screens/movie-details";
import { ScreenFallback } from "@/components/ui";

export default function MoviePage({ params }: PageProps<"/movies/[movie]">) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <MovieDetails params={params} />
    </Suspense>
  );
}
