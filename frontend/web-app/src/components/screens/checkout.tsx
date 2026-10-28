"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Poster } from "@/components/movie-cards";
import { BackLink, LoadError, NotFoundNote, PageTitle, ScreenFallback, Spinner } from "@/components/ui";
import { bookSeats, seatMapKey, useSeatMap } from "@/lib/booking";
import { seatLabel, seatsFromLabels, sortSeats } from "@/lib/booking-view";
import { CATALOG_KEY, branchById, retry, showtimeById, useCatalog, type Branch, type Movie, type Showtime } from "@/lib/catalog";
import { MAX_SEATS, getDays, money } from "@/lib/data";

type Props = {
  params: Promise<{ showtime: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export function Checkout({ params, searchParams }: Props) {
  const { showtime } = use(params);
  const raw = use(searchParams).seats;
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
  if (!st || !m || !b) return <NotFoundNote title="Those seats aren’t available" href="/branches" cta="Choose seats again" />;
  const labels = typeof raw === "string" ? raw.split(",").filter(Boolean) : [];
  return <Review st={st} m={m} b={b} labels={labels} />;
}

function Review({ st, m, b, labels }: { st: Showtime; m: Movie; b: Branch; labels: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lost, setLost] = useState(false);
  const map = useSeatMap(st.id, st.room.id);
  if (map.error)
    return (
      <div className="px-page pt-10">
        <LoadError what="the seat map" onRetry={() => retry(seatMapKey(st.id))} />
      </div>
    );
  if (!map.data) return <ScreenFallback />;

  const { taken } = map.data;
  const resolved = seatsFromLabels(labels, map.data.seats);
  const valid = resolved && resolved.length > 0 && resolved.length <= MAX_SEATS && resolved.every((x) => !taken.has(x.id));
  if (lost) return <NotFoundNote title="Those seats were just taken" href={`/book/${st.id}`} cta="Choose seats again" />;
  // While confirming, a refreshed seat map marks our own seats taken; keep the page until the redirect.
  if (!resolved || (!valid && !pending)) return <NotFoundNote title="Those seats aren’t available" href={`/book/${st.id}`} cta="Choose seats again" />;

  const picked = sortSeats(resolved);
  const seats = picked.map(seatLabel);
  const day = getDays()[st.day].label;
  const total = money(st.price * seats.length);

  const confirm = async () => {
    setPending(true);
    setFailed(false);
    const res = await bookSeats(st.id, picked.map((x) => x.id));
    if ("ref" in res) return router.replace(`/tickets/${res.ref}?new=1`);
    setPending(false);
    if (res.error === "seats_taken") setLost(true);
    else setFailed(true);
  };

  const summary: [string, string][] = [
    ["Movie", m.title],
    ["Branch", `${b.name}, ${b.city}`],
    ["Room · format", `${st.room.name} · ${st.room.format}`],
    ["Date", day],
    ["Time", `${st.start} – ${st.end}`],
    ["Seats", seats.join(", ")],
    ["Price per seat", money(st.price)],
    ["Tickets", String(seats.length)],
  ];

  return (
    <div className="px-page-narrow flex flex-col gap-[18px] pb-10 pt-4">
      <BackLink href={`/book/${st.id}`}>← Back to seats</BackLink>
      <PageTitle>Review &amp; confirm</PageTitle>
      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[1_1_460px] flex-col gap-1 rounded-[20px] p-5">
          <div className="mb-1.5 flex items-center gap-4 border-b border-line pb-3.5">
            <div className="poster-deep relative aspect-[2/3] w-16 flex-none rounded-[10px]">
              <Poster path={m.poster} title={m.title} sizes="64px" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-display text-xl font-semibold">{m.title}</span>
              <span className="text-[13px] text-mu">Order summary</span>
            </div>
          </div>
          <dl>
            {summary.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-[9px] text-[14.5px]">
                <dt className="text-mu">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card flex flex-[1_1_300px] flex-col gap-3.5 rounded-[20px] p-5">
          <div className="flex justify-between text-[14.5px] text-mu">
            <span>
              {seats.length} × {money(st.price)}
            </span>
            <span className="text-tx">{total}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-base font-bold">Total</span>
            <span className="font-display text-[28px] font-semibold text-gold-ink">{total}</span>
          </div>
          <button onClick={confirm} disabled={pending} className="btn btn-gold h-14 text-base disabled:text-tx!">
            {pending ? (
              <>
                <Spinner /> Confirming…
              </>
            ) : (
              "Confirm booking"
            )}
          </button>
          {failed && <p className="text-[13px] font-bold text-err">Couldn’t confirm your booking. Try again.</p>}
          <p className="text-[12.5px] leading-normal text-mu">Pay at the box office or with the card on your account.</p>
        </section>
      </div>

      {pending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim p-6">
          <div role="alertdialog" aria-live="polite" className="card flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[22px] p-7 text-center">
            <Spinner size={44} />
            <span className="font-display text-[19px] font-semibold">Confirming your booking</span>
            <span className="rounded-full border border-gold px-[9px] py-1 font-mono text-[11px] font-medium tracking-[.08em] text-gold-ink">STATUS · PENDING</span>
            <span className="text-sm leading-normal text-mu">Holding seats {seats.join(", ")}. This only takes a moment.</span>
          </div>
        </div>
      )}
    </div>
  );
}
