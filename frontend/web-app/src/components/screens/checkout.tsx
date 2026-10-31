"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { Poster } from "@/components/movie-cards";
import { BackLink, LoadError, NotFoundNote, PageTitle, ScreenFallback, Spinner } from "@/components/ui";
import { releaseCheckout, seatMapKey, startCheckout, useSeatMap } from "@/lib/booking";
import { seatLabel, seatsFromLabels, sortSeats } from "@/lib/booking-view";
import { CATALOG_KEY, branchById, refresh, retry, showtimeById, useCatalog, type Branch, type Movie, type Showtime } from "@/lib/catalog";
import { MAX_SEATS, getDays, money } from "@/lib/data";

type Props = {
  params: Promise<{ showtime: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export function Checkout({ params, searchParams }: Props) {
  const { showtime } = use(params);
  const query = use(searchParams);
  const raw = query.seats;
  const released = typeof query.released === "string" ? query.released : null;
  const router = useRouter();
  const catalog = useCatalog();
  const c = catalog.data;
  // Back from Stripe: free the held seats once, then drop the param so a reload doesn't repeat it.
  // The ref guard keeps StrictMode's double effect from releasing twice.
  const releasing = useRef<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!released || releasing.current === released) return;
    releasing.current = released;
    void (async () => {
      await releaseCheckout(released);
      await refresh(seatMapKey(showtime));
      setDone(released);
      router.replace(`/book/${showtime}/checkout?seats=${typeof raw === "string" ? raw : ""}`);
    })();
  }, [released, showtime, raw, router]);
  if (catalog.error)
    return (
      <div className="px-page pt-10">
        <LoadError what="this showtime" onRetry={() => retry(CATALOG_KEY)} />
      </div>
    );
  if (!c || (released && done !== released)) return <ScreenFallback />;

  const st = showtimeById(c, showtime);
  const m = st && c.movies.find((x) => x.id === st.movie);
  const b = st && branchById(c, st.branch);
  if (!st || !m || !b) return <NotFoundNote title="Those seats aren’t available" href="/branches" cta="Choose seats again" />;
  const labels = typeof raw === "string" ? raw.split(",").filter(Boolean) : [];
  return <Review st={st} m={m} b={b} labels={labels} />;
}

function Review({ st, m, b, labels }: { st: Showtime; m: Movie; b: Branch; labels: string[] }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lost, setLost] = useState(false);
  // Errors where retrying cannot work.
  const [dead, setDead] = useState<"showtime_unavailable" | "invalid_seats" | null>(null);
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
  if (dead === "showtime_unavailable") return <NotFoundNote title="This showtime has already started" href="/branches" cta="Pick another showtime" />;
  if (dead === "invalid_seats") return <NotFoundNote title="Those seats aren’t available" href={`/book/${st.id}`} cta="Choose seats again" />;
  if (lost) return <NotFoundNote title="Those seats were just taken" href={`/book/${st.id}`} cta="Choose seats again" />;
  // While starting payment, our own held seats may show as taken; keep the page until the redirect.
  if (!resolved || (!valid && !pending)) return <NotFoundNote title="Those seats aren’t available" href={`/book/${st.id}`} cta="Choose seats again" />;

  const picked = sortSeats(resolved);
  const seats = picked.map(seatLabel);
  const day = getDays()[st.day].label;
  const total = money(st.price * seats.length);

  const pay = async () => {
    setPending(true);
    setFailed(false);
    const res = await startCheckout(st.id, picked.map((x) => x.id));
    // Stay in the pending dialog while the browser leaves for Stripe.
    if ("url" in res) {
      window.location.assign(res.url);
      return;
    }
    setPending(false);
    if (res.error === "seats_taken") setLost(true);
    else if (res.error === "showtime_unavailable" || res.error === "invalid_seats") setDead(res.error);
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
          <button onClick={pay} disabled={pending} className="btn btn-gold h-14 text-base disabled:text-tx!">
            {pending ? (
              <>
                <Spinner /> Taking you to payment…
              </>
            ) : (
              `Pay ${total}`
            )}
          </button>
          {failed && <p className="text-[13px] font-bold text-err">Couldn’t start payment. Try again.</p>}
          <p className="text-[12.5px] leading-normal text-mu">Seats are held for 10 minutes once you continue to payment. Test mode: no real card is charged.</p>
        </section>
      </div>

      {pending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim p-6">
          <div role="alertdialog" aria-live="polite" className="card flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[22px] p-7 text-center">
            <Spinner size={44} />
            <span className="font-display text-[19px] font-semibold">Taking you to payment</span>
            <span className="rounded-full border border-gold px-[9px] py-1 font-mono text-[11px] font-medium tracking-[.08em] text-gold-ink">STATUS · PENDING</span>
            <span className="text-sm leading-normal text-mu">Holding seats {seats.join(", ")} for 10 minutes.</span>
          </div>
        </div>
      )}
    </div>
  );
}
