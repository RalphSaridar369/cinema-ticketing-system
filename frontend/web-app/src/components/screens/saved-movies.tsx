"use client";

import { useApp } from "@/components/app-shell";
import { GridPoster } from "@/components/movie-cards";
import { BackLink, PageTitle, ScreenFallback } from "@/components/ui";
import { useMoviesById } from "@/lib/catalog";

export function SavedMovies({ list }: { list: "favorites" | "watchlist" }) {
  const s = useApp();
  const ids = s[list];
  const movies = useMoviesById(ids);
  return (
    <div className="px-page flex flex-col gap-4 pb-10 pt-4">
      <BackLink href="/profile">← Profile</BackLink>
      <PageTitle>{list === "favorites" ? "Favorites" : "Watchlist"}</PageTitle>
      {!ids.length && (
        <div className="rounded-[20px] border border-dashed border-line px-6 py-10 text-center text-sm leading-normal text-mu">
          Nothing here yet. Use the buttons on a movie’s page to add it.
        </div>
      )}
      {movies.error && <div className="text-sm text-mu">Couldn’t load your movies. Check your connection.</div>}
      {ids.length > 0 && !movies.data && !movies.error && <ScreenFallback />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-4">
        {movies.data?.map((m) => (
          <GridPoster key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}
