"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useApp } from "@/components/app-shell";
import { BackLink, NotFoundNote } from "@/components/ui";
import { money, ticketCount, type Booking } from "@/lib/data";
import { say } from "@/lib/store";

type Props = {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CARD = 320;
const GAP = 16;

export function Tickets({ params, searchParams }: Props) {
  const s = useApp();
  const { ref } = use(params);
  const justBooked = use(searchParams).new === "1";
  const [i, setI] = useState(0);
  const b = s.bookings.find((x) => x.ref === ref);
  if (!b) return <NotFoundNote title="We couldn’t find that booking" href="/my-tickets" cta="Go to My Tickets" />;

  const title = b.title;
  const n = b.seats.length;
  const cur = Math.min(i, n - 1);

  return (
    <div className="flex flex-col gap-4 pb-10 pt-[18px]">
      <div className="px-page flex flex-col gap-1.5">
        {justBooked ? (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold font-extrabold text-on-gold">✓</span>
            <h1 className="font-display text-[clamp(24px,2.4vw,34px)] font-semibold tracking-[-.02em]">You’re all set</h1>
          </div>
        ) : (
          <>
            <BackLink href="/my-tickets">← My Tickets</BackLink>
            <h1 className="font-display text-[clamp(24px,2.4vw,34px)] font-semibold tracking-[-.02em]">{title}</h1>
          </>
        )}
        <span className="text-sm text-mu">
          {ticketCount(n)} · Booking <span className="font-mono text-tx">{b.ref}</span> · {b.status}
        </span>
      </div>

      <div className="overflow-hidden pb-2 pt-1" aria-roledescription="carousel">
        <div
          className="flex w-full transition-transform duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ gap: GAP, transform: `translateX(calc(50% - ${CARD / 2}px - ${cur * (CARD + GAP)}px))` }}
        >
          {b.seats.map((seat, k) => (
            <TicketCard key={seat} b={b} title={title} seat={seat} k={k} active={k === cur} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button aria-label="Previous ticket" onClick={() => setI(Math.max(0, cur - 1))} className="card flex h-11 w-11 items-center justify-center rounded-full">
          ‹
        </button>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-extrabold">
            {cur + 1} of {n}
          </span>
          <div className="flex gap-[5px]">
            {b.seats.map((seat, k) => (
              <span key={seat} className={`h-1.5 rounded-[3px] ${k === cur ? "w-[18px] bg-gold" : "w-1.5 bg-s3"}`} />
            ))}
          </div>
        </div>
        <button aria-label="Next ticket" onClick={() => setI(Math.min(n - 1, cur + 1))} className="card flex h-11 w-11 items-center justify-center rounded-full">
          ›
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-[max(20px,calc((100%-560px)/2))]">
        <button onClick={() => say("Ticket saved as PDF")} className="btn btn-soft h-[50px] text-[15px]">
          ↓ Download
        </button>
        <button onClick={() => say("Link copied to clipboard")} className="btn btn-soft h-[50px] text-[15px]">
          ↗ Share
        </button>
        {justBooked && (
          <Link href="/my-tickets" className="btn btn-gold col-span-2 h-[54px] text-base">
            Go to My Tickets
          </Link>
        )}
      </div>
    </div>
  );
}

function TicketCard({ b, title, seat, k, active }: { b: Booking; title: string; seat: string; k: number; active: boolean }) {
  const info: [string, string][] = [
    ["Branch", `${b.branchName}, ${b.city}`],
    ["Room · format", `${b.room} · ${b.format}`],
    ["Date", b.date],
    ["Starts", b.start],
  ];
  return (
    <article aria-hidden={!active} className="card relative flex-none overflow-hidden rounded-3xl" style={{ width: CARD }}>
      <div className="flex flex-col gap-3.5 px-5 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-xs font-bold tracking-[.3em] text-gold-ink">VELOUR</span>
          <span className="font-mono text-[11px] font-medium text-mu">
            {k + 1} of {b.seats.length}
          </span>
        </div>
        <span className="font-display text-[22px] font-semibold tracking-[-.01em]">{title}</span>
        <dl className="grid grid-cols-2 gap-x-2.5 gap-y-3">
          {info.map(([label, v]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-mu">{label}</dt>
              <dd className="text-sm font-bold">{v}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-mu">Row</dt>
            <dd className="font-display text-[28px] font-semibold text-gold-ink">{seat[0]}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-mu">Seat</dt>
            <dd className="font-display text-[28px] font-semibold text-gold-ink">{seat.slice(1)}</dd>
          </div>
        </dl>
      </div>

      <div className="relative flex h-[22px] items-center">
        <span className="absolute -left-3 h-6 w-6 rounded-full border border-line bg-bg" />
        <div className="mx-[18px] flex-1 border-t-2 border-dashed border-line" />
        <span className="absolute -right-3 h-6 w-6 rounded-full border border-line bg-bg" />
      </div>

      <div className="flex flex-col items-center gap-2.5 px-5 pb-5 pt-3.5">
        <div className="h-[150px] w-[150px] rounded-xl bg-white p-3">
          <div className="h-full w-full bg-[repeating-conic-gradient(#111_0_25%,#fff_0_50%)] bg-[length:14px_14px]" aria-label="Ticket QR code" />
        </div>
        <span className="font-mono text-[13px] font-medium tracking-[.04em]">
          {b.ref}-{String(k + 1).padStart(2, "0")}
        </span>
        <span className="text-[13px] text-mu">{money(b.price)} · show at the entrance</span>
      </div>

      {b.status !== "Confirmed" && <Stamp cancelled={b.status === "Cancelled"} />}
    </article>
  );
}

function Stamp({ cancelled }: { cancelled: boolean }) {
  return (
    <div
      className={`absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 -rotate-[16deg] rounded-[10px] border-4 bg-[color-mix(in_oklab,var(--s1)_80%,transparent)] font-display font-bold ${
        cancelled ? "border-err px-[18px] py-2 text-[30px] tracking-[.1em] text-err" : "border-gold-ink px-[26px] py-2 text-[40px] tracking-[.14em] text-gold-ink"
      }`}
    >
      {cancelled ? "CANCELLED" : "USED"}
    </div>
  );
}
