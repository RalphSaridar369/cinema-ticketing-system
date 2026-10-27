"use client";

import Link from "next/link";
import { use, useEffect } from "react";
import { useApp } from "@/components/app-shell";
import { Poster } from "@/components/movie-cards";
import { ShowtimeChip } from "@/components/showtimes";
import { DayPicker, EmptyState, LoadError, NotFoundNote, PageTitle, ScreenFallback } from "@/components/ui";
import { CATALOG_KEY, branchBySlug, moviesAt, retry, showtimesFor, useCatalog } from "@/lib/catalog";
import { genreLine, getDays } from "@/lib/data";
import { setState } from "@/lib/store";

export function BranchMovies({ params }: { params: Promise<{ branch: string }> }) {
  const s = useApp();
  const { branch: slug } = use(params);
  const catalog = useCatalog();
  const c = catalog.data;
  const branch = c ? branchBySlug(c, slug) : null;
  const dayLabel = getDays()[s.day].label;

  // Opening a branch URL directly makes it the selected branch.
  useEffect(() => {
    if (branch && s.branch !== branch.id) setState({ branch: branch.id });
  }, [s.branch, branch]);

  if (catalog.error)
    return (
      <div className="px-page pt-10">
        <LoadError what="this branch" onRetry={() => retry(CATALOG_KEY)} />
      </div>
    );
  if (!c) return <ScreenFallback />;
  if (!branch) return <NotFoundNote title="We couldn’t find that cinema" href="/branches" cta="Choose a cinema" />;
  // Movies screening on the picked day, most popular first.
  const movies = moviesAt(c, branch.id)
    .map((m) => ({ m, times: showtimesFor(c, branch.id, m.id, s.day) }))
    .filter((x) => x.times.length)
    .sort((a, b) => b.m.popularity - a.m.popularity);

  return (
    <div className="px-page flex flex-col gap-4 pb-10 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs font-medium tracking-[.12em] text-gold-ink">{branch.city.toUpperCase()}</span>
          <PageTitle>Showing at {branch.name}</PageTitle>
        </div>
        <Link href="/branches" className="text-sm font-bold text-gold-ink">
          Change branch
        </Link>
      </div>
      <DayPicker value={s.day} onChange={(day) => setState({ day })} />
      {!movies.length && <EmptyState>No showtimes at {branch.name} on {dayLabel}.</EmptyState>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))] gap-3.5">
        {movies.map(({ m, times }) => (
          <article key={m.id} className="card flex gap-4 rounded-[18px] p-3.5">
            <Link href={`/movies/${m.id}`} aria-label={m.title} className="poster-deep relative aspect-[2/3] w-[clamp(92px,9vw,124px)] flex-none self-start rounded-xl">
              <Poster path={m.poster} title={m.title} sizes="124px" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Link href={`/movies/${m.id}`} className="text-[17px] font-bold">
                {m.title}
              </Link>
              <span className="text-[13px] text-mu">
                {genreLine(m)} · <span className="text-gold-ink">★ {m.rating.toFixed(1)}</span>
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {times.map((st) => (
                  <ShowtimeChip key={st.id} st={st} />
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
