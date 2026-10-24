"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-shell";
import { ShowtimeRow } from "@/components/showtimes";
import { DayPicker, Stars } from "@/components/ui";
import { BRANCHES, MOVIES, getDays, runtime, showtimes } from "@/lib/data";
import { actions, say, setState } from "@/lib/store";

export function MovieDetails({ movieId }: { movieId: number }) {
  const s = useApp();
  const router = useRouter();
  const m = MOVIES[movieId];
  const days = getDays();
  const branch = s.branch != null ? BRANCHES[s.branch] : null;

  // With a branch picked, list its showtimes; otherwise group by branch.
  const groups = (branch ? [branch] : BRANCHES)
    .map((b) => ({ b, items: showtimes(b.id, movieId, s.day) }))
    .filter((g) => g.items.length);
  const anyOn = (d: number) => (branch ? [branch] : BRANCHES).some((b) => showtimes(b.id, movieId, d).length);
  const next = groups.length ? -1 : days.findIndex((d) => d.index > s.day && anyOn(d.index));

  const fav = s.favorites.includes(movieId);
  const wl = s.watchlist.includes(movieId);
  const rating = s.ratings[movieId] ?? 0;

  const toggle = (key: "favorites" | "watchlist", label: string) => {
    const on = actions.toggleList(key, movieId);
    say(on ? `Added to ${label}` : `Removed from ${label}`);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {}
    say("Link copied to clipboard");
  };

  return (
    <>
      <div className="backdrop relative h-[clamp(230px,26vw,400px)]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-bg" />
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          aria-label="Back"
          className="absolute left-[max(16px,calc((100%-1240px)/2))] top-3.5 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-scrim text-lg text-white backdrop-blur-md"
        >
          ←
        </button>
        <span className="absolute right-5 top-[22px] font-mono text-[10px] text-mu">BACKDROP</span>
      </div>

      <div className="px-page flex flex-wrap gap-x-12 gap-y-8 pb-10">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-4">
          <div className="relative -mt-[clamp(70px,8vw,130px)] flex items-end gap-[18px]">
            <div className="aspect-[2/3] w-[clamp(108px,15vw,210px)] flex-none rounded-[14px] border border-line bg-[repeating-linear-gradient(135deg,var(--s3)_0_10px,var(--s2)_10px_11px)] shadow-[0_20px_40px_rgba(0,0,0,.35)]" />
            <div className="flex min-w-0 flex-col gap-1.5 pb-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-[clamp(24px,3.2vw,46px)] font-semibold leading-[1.05] tracking-[-.025em]">{m.title}</h1>
                {m.adult && <span className="rounded-md border-[1.5px] border-err px-[7px] py-[3px] text-xs font-extrabold text-err">18+</span>}
              </div>
              <span className="text-[13px] text-mu">
                {m.original} · {m.lang}
              </span>
              <span className="text-sm">
                <span className="font-extrabold text-gold-ink">★ {m.rating.toFixed(1)}</span>
                <span className="text-mu">/10 · {m.votes} votes</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {m.genres.map((g) => (
              <span key={g} className="card rounded-full px-3 py-1.5 text-[12.5px] font-semibold">
                {g}
              </span>
            ))}
            <span className="text-[13px] text-mu">
              Released {m.released} · {runtime(m.runtime)}
            </span>
          </div>
          <p className="max-w-[640px] text-pretty text-[15px] leading-relaxed text-mu">{m.overview}</p>

          <div className="flex flex-wrap gap-2.5">
            <button aria-pressed={fav} onClick={() => toggle("favorites", "Favorites")} className={`btn h-[46px] rounded-xl px-4 text-sm font-bold ${fav ? "btn-gold" : "btn-soft"}`}>
              {fav ? "♥ Favorited" : "♡ Favorite"}
            </button>
            <button aria-pressed={wl} onClick={() => toggle("watchlist", "Watchlist")} className={`btn h-[46px] rounded-xl px-4 text-sm font-bold ${wl ? "btn-gold" : "btn-soft"}`}>
              {wl ? "✓ In watchlist" : "＋ Add to watchlist"}
            </button>
            <button onClick={share} className="btn btn-soft h-[46px] rounded-xl px-4 text-sm">
              ↗ Share
            </button>
          </div>

          <div className="card flex max-w-[560px] flex-wrap items-center justify-between gap-3 rounded-2xl px-[18px] py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">Rate this movie</span>
              <span className="text-[12.5px] text-mu">{rating ? `Your rating: ${rating} / 5` : "Tap a star · half stars allowed"}</span>
            </div>
            <Stars
              value={rating}
              onRate={(v) => {
                actions.rate(movieId, v);
                say(`Rated ${v} / 5`);
              }}
            />
          </div>
        </div>

        <section className="mt-2 flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[21px] font-semibold">{branch ? `Showtimes at ${branch.name}` : "Showtimes · all branches"}</h2>
            <Link href="/branches" className="text-[13px] font-bold text-gold-ink">
              Change
            </Link>
          </div>
          <DayPicker compact value={s.day} onChange={(day) => setState({ day })} />

          {!groups.length && (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line px-[22px] py-[30px] text-center">
              <span className="font-display text-[17px] font-semibold">No showtimes on {days[s.day].label}</span>
              <span className="text-sm leading-normal text-mu">
                {m.title} isn’t playing at {branch ? branch.name : "any branch"} on this date.
              </span>
              {next >= 0 && (
                <button onClick={() => setState({ day: next })} className="btn btn-outline mt-1.5 h-11 rounded-xl px-[18px] text-sm">
                  Next showing: {days[next].label}
                </button>
              )}
              <Link href="/branches" className="text-[13px] text-mu underline">
                Try another branch
              </Link>
            </div>
          )}

          {groups.map(({ b, items }) => (
            <div key={b.id} className="flex flex-col gap-3.5">
              {!branch && (
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-[15px] font-extrabold">
                    {b.name} <span className="font-medium text-mu">· {b.city}</span>
                  </span>
                  <span className="text-[12.5px] font-bold text-gold-ink">{b.dist}</span>
                </div>
              )}
              {items.map((st) => (
                <ShowtimeRow key={st.id} st={st} />
              ))}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
