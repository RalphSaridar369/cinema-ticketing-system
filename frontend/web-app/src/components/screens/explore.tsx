"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GridPoster } from "@/components/movie-cards";
import { EmptyState, LoadError, PageTitle, ScreenFallback, Spinner } from "@/components/ui";
import {
  EXPLORE_PAGE,
  GENRES_KEY,
  exploreKey,
  retry,
  useCatalog,
  useExplorePage,
  useGenres,
  type ExploreFilters,
  type ExploreSort,
} from "@/lib/catalog";

const SORTS: [ExploreSort, string][] = [
  ["popular", "Popular"],
  ["rated", "Top rated"],
  ["newest", "Newest"],
];
const isSort = (s: string | null): s is ExploreSort => SORTS.some(([k]) => k === s);

type Draft = { q: string; genre: string; sort: ExploreSort };

// Every movie, scheduled or not. The form edits a draft; Apply writes it to the
// URL, which drives the fetch and survives opening a movie and coming back.
export function Explore() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const applied: Draft = {
    q: params.get("q") ?? "",
    genre: params.get("genre") ?? "All",
    sort: isSort(params.get("sort")) ? (params.get("sort") as ExploreSort) : "popular",
  };
  const [draft, setDraft] = useState<Draft>(applied);
  const genres = useGenres();

  const dirty = draft.q.trim() !== applied.q || draft.genre !== applied.genre || draft.sort !== applied.sort;

  const apply = () => {
    const next = new URLSearchParams();
    if (draft.q.trim()) next.set("q", draft.q.trim());
    if (draft.genre !== "All") next.set("genre", draft.genre);
    if (draft.sort !== "popular") next.set("sort", draft.sort);
    const qs = next.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  };

  const reset = () => {
    setDraft({ q: "", genre: "All", sort: "popular" });
    router.replace(path, { scroll: false });
  };

  if (genres.error)
    return (
      <div className="px-5 pt-10">
        <LoadError what="movies" onRetry={() => retry(GENRES_KEY)} />
      </div>
    );
  if (!genres.data) return <ScreenFallback />;

  const names = [...genres.data.values()];
  const genreId = [...genres.data].find(([, name]) => name === applied.genre)?.[0] ?? null;
  const filters: ExploreFilters = { q: applied.q, genre: genreId, sort: applied.sort };
  const filtered = applied.q !== "" || applied.genre !== "All" || applied.sort !== "popular";

  return (
    <div className="flex flex-col gap-4 px-5 pb-10 pt-4">
      <PageTitle>Explore</PageTitle>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <input
          type="search"
          aria-label="Search movies"
          value={draft.q}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          placeholder="Search movies"
          className="field h-[50px]"
        />

        <div role="group" aria-label="Genres" className="flex flex-wrap gap-2">
          {["All", ...names].map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={draft.genre === g}
              onClick={() => setDraft({ ...draft, genre: g })}
              className={`flex-none rounded-full px-4 py-[9px] text-[13.5px] ${draft.genre === g ? "bg-tx font-bold text-bg" : "card"}`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-mu">
            Sort
            <select
              value={draft.sort}
              onChange={(e) => setDraft({ ...draft, sort: e.target.value as ExploreSort })}
              className="card rounded-lg px-2 py-1.5 font-bold text-tx"
            >
              {SORTS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!dirty} className="btn btn-gold h-11 px-6 text-sm">
            Apply
          </button>
          {filtered && (
            <button type="button" onClick={reset} className="text-[13px] font-bold text-gold-ink">
              Clear
            </button>
          )}
        </div>
      </form>

      <Results key={exploreKey(filters, 0)} f={filters} />
    </div>
  );
}

function Results({ f }: { f: ExploreFilters }) {
  const [pages, setPages] = useState(1);
  const first = useExplorePage(f, 0);
  const last = useExplorePage(f, pages - 1);
  const playing = new Set(useCatalog().data?.movies.map((m) => m.id));

  if (first.error)
    return <LoadError what="movies" onRetry={() => retry(exploreKey(f, 0))} />;
  if (!first.data) return <ScreenFallback />;

  const total = first.data.total;
  return (
    <>
      <span className="text-[13px] text-mu">
        {total === 1 ? "1 movie" : `${total} movies`}
        {f.sort === "rated" && " with 100+ votes"}
      </span>

      {!total && (
        <EmptyState>
          <span>No movies match these filters.</span>
        </EmptyState>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-4">
        {Array.from({ length: pages }, (_, i) => (
          <Page key={i} f={f} page={i} playing={playing} />
        ))}
      </div>

      {last.error && <LoadError what="more movies" onRetry={() => retry(exploreKey(f, pages - 1))} />}
      {!last.error && (pages * EXPLORE_PAGE < total || !last.data) && (
        <button
          onClick={() => setPages(pages + 1)}
          disabled={!last.data}
          className="btn btn-soft h-[50px] self-center px-8 text-[15px]"
        >
          {last.data ? "Show more" : <Spinner />}
        </button>
      )}
    </>
  );
}

// One page of posters, rendered straight into the parent grid.
function Page({ f, page, playing }: { f: ExploreFilters; page: number; playing: Set<string> }) {
  const res = useExplorePage(f, page);
  return res.data?.movies.map((m) => <GridPoster key={m.id} m={m} badge={playing.has(m.id) ? "THIS WEEK" : undefined} />);
}
