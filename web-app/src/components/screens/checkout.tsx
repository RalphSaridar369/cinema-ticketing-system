"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-shell";
import { BackLink, NotFoundNote, PageTitle, Spinner } from "@/components/ui";
import { BRANCHES, MAX_SEATS, MOVIES, getDays, money, seatSort, showtimeById, unavailableSeats } from "@/lib/data";
import { actions } from "@/lib/store";

type Props = {
  params: Promise<{ showtime: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const newRef = () => "VLR-" + Math.random().toString(36).slice(2, 7).toUpperCase();

export function Checkout({ params, searchParams }: Props) {
  const s = useApp();
  const router = useRouter();
  const { showtime } = use(params);
  const raw = use(searchParams).seats;
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const st = showtimeById(showtime);
  const taken = st ? unavailableSeats(st, s.bookings) : new Set<string>();
  const requested = (typeof raw === "string" ? raw.split(",") : []).filter(Boolean);
  const seats = seatSort([...new Set(requested)]);
  const valid =
    st && !st.soldOut && seats.length > 0 && seats.length <= MAX_SEATS && seats.every((id) => /^[A-Y]([1-9]|10)$/.test(id) && !taken.has(id));

  if (!st || !valid) return <NotFoundNote title="Those seats aren’t available" href={st ? `/book/${st.id}` : "/branches"} cta="Choose seats again" />;

  const m = MOVIES[st.movie];
  const b = BRANCHES[st.branch];
  const day = getDays()[st.day].label;
  const total = money(st.room.price * seats.length);

  const confirm = () => {
    setPending(true);
    timer.current = setTimeout(() => {
      const ref = newRef();
      actions.addBooking({
        ref,
        showtime: st.id,
        movie: st.movie,
        branch: st.branch,
        date: day,
        start: st.start,
        end: st.end,
        roomKey: st.roomKey,
        seats,
        price: st.room.price,
        status: "Confirmed",
      });
      router.replace(`/tickets/${ref}?new=1`);
    }, 1800);
  };

  const summary: [string, string][] = [
    ["Movie", m.title],
    ["Branch", `${b.name}, ${b.city}`],
    ["Room · format", `${st.room.name} · ${st.room.format}`],
    ["Date", day],
    ["Time", `${st.start} – ${st.end}`],
    ["Seats", seats.join(", ")],
    ["Price per seat", money(st.room.price)],
    ["Tickets", String(seats.length)],
  ];

  return (
    <div className="px-page-narrow flex flex-col gap-[18px] pb-10 pt-4">
      <BackLink href={`/book/${st.id}`}>← Back to seats</BackLink>
      <PageTitle>Review &amp; confirm</PageTitle>
      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[1_1_460px] flex-col gap-1 rounded-[20px] p-5">
          <div className="mb-1.5 flex items-center gap-4 border-b border-line pb-3.5">
            <div className="poster-deep aspect-[2/3] w-16 flex-none rounded-[10px]" />
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
              {seats.length} × {money(st.room.price)}
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
          <p className="text-[12.5px] leading-normal text-mu">Pay at the box office or with the card on your account. Seats are held for 10 minutes.</p>
        </section>
      </div>

      {pending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim p-6">
          <div role="alertdialog" aria-live="polite" className="card flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[22px] p-7 text-center">
            <Spinner size={44} />
            <span className="font-display text-[19px] font-semibold">Confirming your booking</span>
            <span className="rounded-full border border-gold px-[9px] py-1 font-mono text-[11px] font-medium tracking-[.08em] text-gold-ink">STATUS · PENDING</span>
            <span className="text-sm leading-normal text-mu">Holding seats {seats.join(", ")}. This takes a few seconds.</span>
          </div>
        </div>
      )}
    </div>
  );
}
