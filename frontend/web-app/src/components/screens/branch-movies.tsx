"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useApp } from "@/components/app-shell";
import { ShowtimeChip } from "@/components/showtimes";
import { DayPicker, PageTitle } from "@/components/ui";
import { BRANCHES, MOVIES, genreLine, getDays, plays, runtime, showtimes } from "@/lib/data";
import { setState } from "@/lib/store";

export function BranchMovies({ branchId }: { branchId: number }) {
  const s = useApp();
  const branch = BRANCHES[branchId];
  const dayLabel = getDays()[s.day].label;

  // Opening a branch URL directly makes it the selected branch.
  useEffect(() => {
    if (s.branch !== branchId) setState({ branch: branchId });
  }, [s.branch, branchId]);

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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))] gap-3.5">
        {MOVIES.filter((m) => plays(branchId, m.id)).map((m) => {
          const times = showtimes(branchId, m.id, s.day);
          return (
            <article key={m.id} className="card flex gap-4 rounded-[18px] p-3.5">
              <Link href={`/movies/${m.slug}`} aria-label={m.title} className="poster-deep aspect-[2/3] w-[clamp(92px,9vw,124px)] flex-none rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Link href={`/movies/${m.slug}`} className="text-[17px] font-bold">
                  {m.title}
                </Link>
                <span className="text-[13px] text-mu">
                  {genreLine(m)} · {runtime(m.runtime)} · <span className="text-gold-ink">★ {m.rating.toFixed(1)}</span>
                </span>
                {!times.length && (
                  <span className="mt-1.5 rounded-[10px] border border-dashed border-line px-3 py-2.5 text-[13px] text-mu">No showtimes on {dayLabel}</span>
                )}
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {times.map((st) => (
                    <ShowtimeChip key={st.id} st={st} />
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
