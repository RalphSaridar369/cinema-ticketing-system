"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BackLink, LoadError, NotFoundNote, ScreenFallback } from "@/components/ui";
import { seatMapKey, useSeatMap, type SeatMap as Seats } from "@/lib/booking";
import { seatLabel, sortSeats } from "@/lib/booking-view";
import { CATALOG_KEY, branchById, refresh, retry, showtimeById, useCatalog, type Branch, type Movie, type Showtime } from "@/lib/catalog";
import { MAX_SEATS, ROW_LETTERS, getDays, money, ticketCount } from "@/lib/data";
import { say } from "@/lib/store";

export function SeatSelection({ params }: { params: Promise<{ showtime: string }> }) {
  const { showtime } = use(params);
  const catalog = useCatalog();
  const c = catalog.data;
  if (catalog.error)
    return (
      <div className="px-page pt-10">
        <LoadError what="this showtime" onRetry={() => retry(CATALOG_KEY)} />
      </div>
    );
  if (!c) return <ScreenFallback />;
  const st = showtimeById(c, showtime);
  const m = st && c.movies.find((x) => x.id === st.movie);
  const b = st && branchById(c, st.branch);
  if (!st || !m || !b || st.soldOut) return <NotFoundNote title="This showtime isn’t available" href="/branches" cta="Pick another showtime" />;
  return <SeatLoader key={st.id} st={st} m={m} b={b} />;
}

function SeatLoader({ st, m, b }: { st: Showtime; m: Movie; b: Branch }) {
  const map = useSeatMap(st.id, st.room.id);
  // A cached map may be stale: show it now, replace it with fresh data.
  useEffect(() => {
    void refresh(seatMapKey(st.id));
  }, [st.id]);
  if (map.error)
    return (
      <div className="px-page pt-10">
        <LoadError what="the seat map" onRetry={() => retry(seatMapKey(st.id))} />
      </div>
    );
  if (!map.data) return <ScreenFallback />;
  const { seats, taken } = map.data;
  if (!seats.length || seats.every((x) => taken.has(x.id)))
    return <NotFoundNote title="This showtime is sold out" href={`/movies/${m.id}`} cta="Pick another showtime" />;
  return <SeatPicker st={st} m={m} b={b} map={map.data} />;
}

function SeatPicker({ st, m, b, map }: { st: Showtime; m: Movie; b: Branch; map: Seats }) {
  const [picked, setSel] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const free = map.seats.length - map.taken.size;
  // Seats taken since they were picked (after a refresh) drop out of the selection.
  const takenLabels = new Set(map.seats.filter((x) => map.taken.has(x.id)).map(seatLabel));
  const sel = picked.filter((l) => !takenLabels.has(l));
  const sorted = sortSeats(sel.map((l) => ({ label: l, row: l[0], number: Number(l.slice(1)) }))).map((x) => x.label);
  const n = sel.length;
  const total = money(st.price * n);
  const label = n ? sorted.join(", ") : "No seats selected";
  const checkoutHref = `/book/${st.id}/checkout?seats=${sorted.join(",")}`;

  const tap = (id: string) =>
    setSel((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= MAX_SEATS) {
        say(`Up to ${MAX_SEATS} seats per booking`);
        return s;
      }
      return [...s, id];
    });

  return (
    <>
      <div className="px-page flex items-center gap-3.5 border-b border-line pb-3 pt-3.5">
        <BackLink href={`/movies/${m.id}`}>
          <span className="card flex h-10 w-10 items-center justify-center rounded-full text-tx" aria-label="Back">
            ←
          </span>
        </BackLink>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[clamp(17px,1.7vw,24px)] font-semibold">{m.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-mu">
            <span>
              {b.name} · {st.room.name}
            </span>
            <span className="tag text-gold-ink">{st.room.format}</span>
            <span>
              {getDays()[st.day].label} · {st.start}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-8 px-[max(12px,calc((100%-1240px)/2))] pt-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {free > 0 && free <= 12 && (
            <div className="mx-2 rounded-xl border border-err bg-s1 px-3.5 py-[11px] text-[13.5px] font-bold text-err">
              Almost full · only {free} seats left for this showtime
            </div>
          )}

          <div className="relative">
            <div className="card mx-2 h-[452px] overflow-auto rounded-2xl pt-[52px] md:mx-0 md:h-auto md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:pt-2">
              <div style={{ zoom }} className="md:[zoom:1]!">
                <SeatMap map={map} sel={sel} onTap={tap} />
              </div>
            </div>
            <div className="absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-xl border border-line bg-s1 shadow-[0_6px_18px_rgba(0,0,0,.25)] md:hidden">
              <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + 0.25))} className="flex h-11 w-11 items-center justify-center border-b border-line text-xl">
                +
              </button>
              <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="flex h-11 w-11 items-center justify-center text-xl">
                −
              </button>
            </div>
            <span className="absolute left-2.5 top-2.5 rounded-md border border-line bg-s1 px-2 py-1 font-mono text-[10px] font-medium text-mu md:hidden">
              {Math.round(zoom * 100)}% · drag to pan
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-4 px-2 pb-4 pt-1 text-xs text-mu">
            <Legend swatch="bg-s2 border border-line">Available</Legend>
            <Legend swatch="bg-s3 opacity-45">Taken</Legend>
            <Legend swatch="bg-gold">Selected</Legend>
            <Legend swatch="border-[1.5px] border-gold-ink">VIP seat</Legend>
          </div>
        </div>

        <aside className="card sticky top-[88px] hidden w-[340px] flex-none flex-col gap-3.5 rounded-[20px] p-[22px] md:flex">
          <span className="font-mono text-[11px] font-medium tracking-[.1em] text-mu">YOUR SEATS</span>
          <span className="font-display text-2xl font-semibold text-gold-ink">{label}</span>
          <Line k="Tickets" v={String(n)} />
          <Line k="Price per seat" v={money(st.price)} />
          <div className="flex justify-between border-t border-line pt-3 text-lg font-extrabold">
            <span>Total</span>
            <span>{total}</span>
          </div>
          <ContinueButton href={n ? checkoutHref : null} label={n ? "Continue" : "Select seats"} className="h-[54px] text-base" />
          <span className="text-xs text-mu">Up to {MAX_SEATS} seats per booking.</span>
        </aside>
      </div>

      <div className="sticky bottom-[76px] mt-2 flex items-center gap-3.5 border-t border-line bg-s1 px-5 py-3.5 md:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-base font-extrabold text-gold-ink">{label}</span>
          <span className="text-[12.5px] text-mu">
            {ticketCount(n)} · {money(st.price)} × {n} = {total}
          </span>
        </div>
        <ContinueButton href={n ? checkoutHref : null} label="Continue" className="h-[50px] px-6 text-[15px]" />
      </div>
    </>
  );
}

function SeatMap({ map, sel, onTap }: { map: Seats; sel: string[]; onTap: (label: string) => void }) {
  const rows = [...ROW_LETTERS].map((letter) => ({ letter, seats: map.seats.filter((x) => x.row === letter) })).filter((r) => r.seats.length);
  const seat = (s: Seats["seats"][number]) => {
    const id = seatLabel(s);
    const base = "flex h-[calc(var(--seat)*.88)] w-[var(--seat)] items-center justify-center rounded-[7px_7px_4px_4px]";
    if (map.taken.has(s.id))
      return (
        <div key={s.id} aria-label={`${id}, taken`} className={`${base} bg-s3 text-[10px] text-mu opacity-45`}>
          ×
        </div>
      );
    const selected = sel.includes(id);
    const look = selected
      ? "bg-gold text-on-gold text-[10px] font-extrabold"
      : s.vip
        ? "border-[1.5px] border-gold-ink text-gold-ink text-[9.5px]"
        : "bg-s2 border border-line text-mu text-[9.5px] hover:border-gold";
    return (
      <button key={s.id} title={id} aria-label={`${id}${s.vip ? ", VIP" : ""}`} aria-pressed={selected} onClick={() => onTap(id)} className={`${base} ${look}`}>
        {s.number}
      </button>
    );
  };

  return (
    <div className="mx-auto flex w-max flex-col items-center gap-1.5 px-2 pb-5 pt-2 [--seat:clamp(25px,2.4vw,34px)]">
      <div className="h-[22px] w-[calc(var(--seat)*10.5)] rounded-[50%_50%_0_0/100%_100%_0_0] border-t-[3px] border-gold shadow-[0_-10px_24px_-12px_var(--gold)]" />
      <span className="-mt-2.5 mb-3 font-mono text-[10px] font-medium tracking-[.3em] text-mu">SCREEN</span>
      {rows.map(({ letter, seats }) => (
        <div key={letter} className="flex items-center gap-[calc(var(--seat)*.18)]">
          <span className="w-4 font-mono text-[11px] font-medium text-mu">{letter}</span>
          {seats.slice(0, 5).map(seat)}
          <span className="w-[calc(var(--seat)*.7)]" />
          {seats.slice(5).map(seat)}
          <span className="w-4 text-right font-mono text-[11px] font-medium text-mu">{letter}</span>
        </div>
      ))}
    </div>
  );
}

function ContinueButton({ href, label, className }: { href: string | null; label: string; className: string }) {
  if (!href)
    return (
      <button disabled className={`btn btn-gold ${className}`}>
        {label}
      </button>
    );
  return (
    <Link href={href} className={`btn btn-gold ${className}`}>
      {label}
    </Link>
  );
}

function Legend({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3.5 w-4 rounded ${swatch}`} />
      {children}
    </span>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm text-mu">
      <span>{k}</span>
      <strong className="text-tx">{v}</strong>
    </div>
  );
}
