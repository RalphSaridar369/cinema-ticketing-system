"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BranchPill, useApp } from "@/components/app-shell";
import { FeatureCard, PosterCard } from "@/components/movie-cards";
import { EmptyState, Wordmark } from "@/components/ui";
import { BRANCHES, GENRES, MOVIES, POPULAR, RECOMMENDED, plays } from "@/lib/data";
import { say, setState } from "@/lib/store";

const LOADED_KEY = "velour:home-loaded";

// Stands in for the first catalogue fetch of a session.
function useFirstLoad(ms: number) {
  const [loading, setLoading] = useState(() => {
    try {
      return !sessionStorage.getItem(LOADED_KEY);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(LOADED_KEY, "1");
      } catch {}
      setLoading(false);
    }, ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return loading;
}

export default function HomePage() {
  const s = useApp();
  const loading = useFirstLoad(1400);
  const branch = s.branch != null ? BRANCHES[s.branch] : null;
  const atBranch = MOVIES.filter((m) => plays(s.branch, m.id));
  const nowShowing = s.genre === "All" ? atBranch : atBranch.filter((m) => m.genres.includes(s.genre));
  const recommended = RECOMMENDED.filter((i) => plays(s.branch, i)).map((i) => MOVIES[i]);

  return (
    <>
      <div className="flex items-center justify-between px-5 pb-1.5 pt-2.5 md:hidden">
        <Wordmark size={14} />
        <BranchPill s={s} compact />
      </div>
      {loading ? (
        <HomeSkeleton />
      ) : (
        <div className="flex flex-col gap-[18px] pb-10 pt-3.5">
          <SectionHead title="Recommended for you" aside="Based on what you watch" big />
          <Row className="scroll-px-page snap-x snap-mandatory gap-4">
            {recommended.map((m) => (
              <FeatureCard key={m.id} m={m} />
            ))}
          </Row>

          <Row className="gap-2 pt-1" label="Genres">
            {GENRES.map((g) => (
              <button
                key={g}
                aria-pressed={s.genre === g}
                onClick={() => setState({ genre: g })}
                className={`flex-none rounded-full px-4 py-[9px] text-[13.5px] ${s.genre === g ? "bg-tx font-bold text-bg" : "card"}`}
              >
                {g}
              </button>
            ))}
          </Row>

          <div className="px-page flex items-baseline justify-between pt-2">
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
            <div className="px-page">
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
            {POPULAR.map((i, k) => (
              <PosterCard key={i} m={MOVIES[i]} rank={k + 1} sub={`★ ${MOVIES[i].rating.toFixed(1)}`} />
            ))}
          </Row>
        </div>
      )}
    </>
  );
}

function SectionHead({ title, aside, big }: { title: string; aside: string; big?: boolean }) {
  return (
    <div className={`px-page flex items-baseline justify-between ${big ? "" : "pt-2"}`}>
      <h2 className={`font-display font-semibold ${big ? "text-[clamp(22px,2.2vw,30px)] tracking-[-.02em]" : "text-[clamp(19px,1.8vw,24px)]"}`}>{title}</h2>
      <span className="text-[13px] text-mu">{aside}</span>
    </div>
  );
}

function Row({ children, className = "", label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div aria-label={label} className={`px-page no-scrollbar flex overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}

function HomeSkeleton() {
  const six = [1, 2, 3, 4, 5, 6];
  return (
    <div className="px-page flex flex-col gap-[18px] pb-10 pt-5" aria-busy>
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
