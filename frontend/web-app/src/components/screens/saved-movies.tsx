"use client";

import { useState } from "react";
import { useApp } from "@/components/app-shell";
import { GridPoster } from "@/components/movie-cards";
import { BackLink, Modal, PageTitle, ScreenFallback } from "@/components/ui";
import { useMoviesById, type Movie } from "@/lib/catalog";
import { actions, say } from "@/lib/store";

export function SavedMovies({ list }: { list: "favorites" | "watchlist" }) {
  const s = useApp();
  const ids = s[list];
  const label = list === "favorites" ? "Favorites" : "Watchlist";
  // Movies are fetched for the list as it was when the page opened. Removing
  // one then just hides its card instead of refetching the rest, and a removal
  // that fails to save brings it back.
  const [opened] = useState(ids);
  const movies = useMoviesById(opened);
  const shown = movies.data?.filter((m) => ids.includes(m.id)) ?? [];
  // The movie waiting for the user to confirm its removal.
  const [confirm, setConfirm] = useState<Movie | null>(null);

  const remove = (m: Movie) => {
    setConfirm(null);
    actions.toggleList(list, m.id);
    say(`Removed ${m.title} from ${label}`);
  };

  return (
    <div className="px-page flex flex-col gap-4 pb-10 pt-4">
      <BackLink href="/profile">← Profile</BackLink>
      <PageTitle>{label}</PageTitle>
      {!ids.length && (
        <div className="rounded-[20px] border border-dashed border-line px-6 py-10 text-center text-sm leading-normal text-mu">
          Nothing here yet. Use the buttons on a movie’s page to add it.
        </div>
      )}
      {movies.error && <div className="text-sm text-mu">Couldn’t load your movies. Check your connection.</div>}
      {ids.length > 0 && !movies.data && !movies.error && <ScreenFallback />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-4">
        {shown.map((m) => (
          // The button sits beside the card's link, not inside it: a button
          // can't be nested in a link.
          <div key={m.id} className="relative">
            <GridPoster m={m} />
            <button
              onClick={() => setConfirm(m)}
              aria-label={`Remove ${m.title} from ${label}`}
              title={`Remove from ${label}`}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-scrim text-sm text-white backdrop-blur-md hover:bg-err"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[22px] font-semibold">Remove from {label}?</h2>
            <p className="text-[15px] leading-normal text-mu">
              Are you sure you want to remove <strong className="text-tx">{confirm.title}</strong> from your {label.toLowerCase()}?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <button autoFocus onClick={() => setConfirm(null)} className="btn h-[50px] border border-line text-[15px] font-bold">
                Cancel
              </button>
              <button onClick={() => remove(confirm)} className="btn h-[50px] bg-err text-[15px] text-white">
                Remove
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
