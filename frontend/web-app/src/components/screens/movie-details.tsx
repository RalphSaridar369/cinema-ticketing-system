"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { useApp } from "@/components/app-shell";
import { Poster } from "@/components/movie-cards";
import { ShowtimeRow } from "@/components/showtimes";
import { DayPicker, LoadError, NotFoundNote, ScreenFallback, Stars } from "@/components/ui";
import { CATALOG_KEY, branchById, posterUrl, retry, showtimesFor, useCatalog, useMovieDetail, type Catalog, type MovieDetail } from "@/lib/catalog";
import { getDays } from "@/lib/data";
import { actions, say, setState } from "@/lib/store";

export function MovieDetails({ params }: { params: Promise<{ movie: string }> }) {
  const { movie: id } = use(params);
  const movie = useMovieDetail(id);
  const catalog = useCatalog();
  const error = movie.error ?? catalog.error;
  if (error)
    return (
      <div className="px-page pt-10">
        <LoadError
          what="this movie"
          onRetry={() => {
            retry(`movie:${id}`);
            retry(CATALOG_KEY);
          }}
        />
      </div>
    );
  if (movie.data === undefined || !catalog.data) return <ScreenFallback />;
  if (!movie.data) return <NotFoundNote title="We couldn’t find that movie" href="/" cta="Back to home" />;
  return <Details m={movie.data} c={catalog.data} />;
}

function Details({ m, c }: { m: MovieDetail; c: Catalog }) {
  const s = useApp();
  const router = useRouter();
  const movieId = m.id;
  const days = getDays();
  const branch = branchById(c, s.branch);

  // With a branch picked, list its showtimes; otherwise group by branch.
  const groups = (branch ? [branch] : c.branches)
    .map((b) => ({ b, items: showtimesFor(c, b.id, movieId, s.day) }))
    .filter((g) => g.items.length);
  const anyOn = (d: number) => showtimesFor(c, branch?.id ?? null, movieId, d).length > 0;
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
      <title>{m.title}</title>
      <div className="backdrop relative h-[clamp(230px,26vw,400px)]">
        {m.backdrop && <Image src={posterUrl(m.backdrop, "w1280")} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-bg" />
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          aria-label="Back"
          className="absolute left-[max(16px,calc((100%-1240px)/2))] top-3.5 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-scrim text-lg text-white backdrop-blur-md"
        >
          ←
        </button>
        {!m.backdrop && <span className="absolute right-5 top-[22px] font-mono text-[10px] text-mu">BACKDROP</span>}
      </div>

      <div className="px-page flex flex-wrap gap-x-12 gap-y-8 pb-10">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-4">
          <div className="relative -mt-[clamp(70px,8vw,130px)] flex items-end gap-[18px]">
            <div className="relative aspect-[2/3] w-[clamp(108px,15vw,210px)] flex-none rounded-[14px] border border-line bg-[repeating-linear-gradient(135deg,var(--s3)_0_10px,var(--s2)_10px_11px)] shadow-[0_20px_40px_rgba(0,0,0,.35)]">
              <Poster path={m.poster} title={m.title} sizes="210px" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 pb-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-[clamp(24px,3.2vw,46px)] font-semibold leading-[1.05] tracking-[-.025em]">{m.title}</h1>
                {m.adult && <span className="rounded-md border-[1.5px] border-err px-[7px] py-[3px] text-xs font-extrabold text-err">18+</span>}
              </div>
              <span className="text-[13px] text-mu">
                {[m.original, m.lang].filter(Boolean).join(" · ")}
              </span>
              <span className="text-sm">
                <span className="font-extrabold text-gold-ink">★ {m.rating.toFixed(1)}</span>
                <span className="text-mu">/10 · {m.votes.toLocaleString("en-US")} votes</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {m.genres.map((g) => (
              <span key={g} className="card rounded-full px-3 py-1.5 text-[12.5px] font-semibold">
                {g}
              </span>
            ))}
            {m.released && <span className="text-[13px] text-mu">Released {m.released}</span>}
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
                <span className="mt-1.5 text-[15px] font-extrabold">
                  {b.name} <span className="font-medium text-mu">· {b.city}</span>
                </span>
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
