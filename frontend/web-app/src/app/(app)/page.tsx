"use client";

import Link from "next/link";
import { useApp } from "@/components/app-shell";
import { BranchPill } from "@/components/branch-picker";
import { FeatureCard, PosterCard } from "@/components/movie-cards";
import { EmptyState, LoadError, Wordmark } from "@/components/ui";
import { CATALOG_KEY, branchById, moviesAt, retry, useCatalog, useTaste, type Movie } from "@/lib/catalog";
import { say, setState } from "@/lib/store";

const ROW = 10;

const byPopularity = (a: Movie, b: Movie) => b.popularity - a.popularity;

// Rating pulled toward zero when there are few votes, so a single 10/10 vote
// doesn't top the list.
const confidentRating = (m: Movie) => (m.rating * m.votes) / (m.votes + 100);

// Movies whose genres best match the user's taste, best rated first on a tie.
function recommend(movies: Movie[], taste: Map<string, number>) {
  const score = (m: Movie) => m.genres.reduce((sum, g) => sum + (taste.get(g) ?? 0), 0);
  return movies.toSorted((a, b) => score(b) - score(a) || confidentRating(b) - confidentRating(a)).slice(0, ROW);
}

// "All" plus the genres of the given movies, most common first.
function genresOf(movies: Movie[]) {
  const count = new Map<string, number>();
  for (const m of movies) for (const g of m.genres) count.set(g, (count.get(g) ?? 0) + 1);
  return ["All", ...[...count].sort((a, b) => b[1] - a[1]).map(([g]) => g)];
}

export default function HomePage() {
  const s = useApp();
  const catalog = useCatalog();
  const taste = useTaste(s.profile.email || null);
  const c = catalog.data;
  const loading = !catalog.error && (!c || (!taste.data && !taste.error));

  const branch = c ? branchById(c, s.branch) : null;
  const atBranch = c ? moviesAt(c, branch?.id ?? null).toSorted(byPopularity) : [];
  const genres = genresOf(atBranch);
  const nowShowing = s.genre === "All" ? atBranch : atBranch.filter((m) => m.genres.includes(s.genre));
  const tasteMap = taste.data ?? new Map<string, number>();
  const recommended = recommend(atBranch, tasteMap);
  const popular = c ? c.movies.toSorted(byPopularity).slice(0, ROW) : [];

  return (
    <>
      <div className="flex items-center justify-between px-5 pb-1.5 pt-2.5 md:hidden">
        <Wordmark size={14} />
        <BranchPill s={s} compact />
      </div>
      {catalog.error ? (
        <div className="px-5 pt-10">
          <LoadError what="what’s showing" onRetry={() => retry(CATALOG_KEY)} />
        </div>
      ) : loading ? (
        <HomeSkeleton />
      ) : (
        <div className="flex flex-col gap-[18px] pb-10 pt-3.5">
          <SectionHead title="Recommended for you" aside={tasteMap.size ? "Based on what you watch" : "Top rated this week"} big />
          <Row snap className="gap-4">
            {recommended.map((m) => (
              <FeatureCard key={m.id} m={m} />
            ))}
          </Row>

          <div role="group" aria-label="Genres" className="flex flex-wrap gap-2 px-5 pt-1">
            {genres.map((g) => (
              <button
                key={g}
                aria-pressed={s.genre === g}
                onClick={() => setState({ genre: g })}
                className={`flex-none rounded-full px-4 py-[9px] text-[13.5px] ${s.genre === g ? "bg-tx font-bold text-bg" : "card"}`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="flex items-baseline justify-between px-5 pt-2">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-display text-[clamp(19px,1.8vw,24px)] font-semibold">Now Showing</h2>
              <span className="text-[13px] text-mu">
                at {branch ? branch.name : "all branches"} ·{" "}
                <Link href="/branches" className="font-bold text-gold-ink">
                  {branch ? "Change" : "Pick a cinema"}
                </Link>
              </span>
            </div>
            <span className="text-[13px] text-mu">{nowShowing.length} films</span>
          </div>
          {!nowShowing.length && (
            <div className="px-5">
              <EmptyState>
                <span>{branch ? `Nothing in ${s.genre} at ${branch.name} right now.` : `No movies in ${s.genre} right now.`}</span>
                {branch && (
                  <button
                    className="font-bold text-gold-ink"
                    onClick={() => {
                      setState({ branch: null });
                      say("Showing all branches");
                    }}
                  >
                    See all branches
                  </button>
                )}
              </EmptyState>
            </div>
          )}
          <Row className="gap-3.5">
            {nowShowing.map((m) => (
              <PosterCard key={m.id} m={m} />
            ))}
          </Row>

          <SectionHead title="Popular" aside="This week in Lebanon" />
          <Row className="gap-3.5">
            {popular.map((m, k) => (
              <PosterCard key={m.id} m={m} rank={k + 1} sub={`★ ${m.rating.toFixed(1)}`} />
            ))}
          </Row>
        </div>
      )}
    </>
  );
}

function SectionHead({ title, aside, big }: { title: string; aside: string; big?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between px-5 ${big ? "" : "pt-2"}`}>
      <h2 className={`font-display font-semibold ${big ? "text-[clamp(22px,2.2vw,30px)] tracking-[-.02em]" : "text-[clamp(19px,1.8vw,24px)]"}`}>{title}</h2>
      <span className="text-[13px] text-mu">{aside}</span>
    </div>
  );
}

// The page gutter is margin, not padding, so scrolling stops exactly at the
// first and last card, and overscroll-none stops the bounce past them. Snapping
// rows snap the last card to the end, or the nearest card start would pull the
// row back short of it.
function Row({ children, className = "", snap }: { children: React.ReactNode; className?: string; snap?: boolean }) {
  return (
    <div className={`no-scrollbar mx-5 flex overflow-x-auto overscroll-x-none ${snap ? "snap-x snap-mandatory [&>:last-child]:snap-end" : ""} ${className}`}>
      {children}
    </div>
  );
}

function HomeSkeleton() {
  const six = [1, 2, 3, 4, 5, 6];
  return (
    <div className="flex flex-col gap-[18px] px-5 pb-10 pt-5" aria-busy>
      <div className="h-6 w-[200px] rounded-md bg-s2" />
      <div className="flex gap-4 overflow-hidden">
        {six.map((x) => (
          <div key={x} className="flex w-[clamp(150px,14vw,200px)] flex-none flex-col gap-2">
            <div className="aspect-[2/3] rounded-[14px] bg-s2" />
            <div className="h-3.5 w-4/5 rounded bg-s2" />
            <div className="h-3 w-1/2 rounded bg-s1" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 overflow-hidden">
        {six.map((x) => (
          <div key={x} className="h-9 w-[84px] flex-none rounded-full bg-s2" />
        ))}
      </div>
      <div className="h-[22px] w-[150px] rounded-md bg-s2" />
      <div className="flex gap-3.5 overflow-hidden">
        {six.map((x) => (
          <div key={x} className="aspect-[2/3] w-[clamp(120px,11vw,170px)] flex-none rounded-xl bg-s2" />
        ))}
      </div>
      <div className="text-center font-mono text-xs text-mu">Loading…</div>
    </div>
  );
}
