"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp, useBookHref } from "@/components/app-shell";
import { Poster } from "@/components/movie-cards";
import { Badge, LoadError, PageTitle, ScreenFallback } from "@/components/ui";
import { bookingsKey, useMyBookings } from "@/lib/booking";
import { retry } from "@/lib/catalog";
import { ticketCount } from "@/lib/data";

type Tab = "upcoming" | "past";

export default function MyTicketsPage() {
  const s = useApp();
  const [tab, setTab] = useState<Tab>("upcoming");
  const bookHref = useBookHref(s);
  const bookings = useMyBookings(s.userId);
  // Upcoming: soonest showtime first; Past keeps the loaded newest-first order.
  const list = (bookings.data ?? []).filter((b) => b.upcoming === (tab === "upcoming"));
  if (tab === "upcoming") list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return (
    <div className="px-page flex flex-col gap-[18px] pb-10 pt-4">
      <PageTitle>My Tickets</PageTitle>
      <div role="tablist" className="card flex max-w-[360px] rounded-[14px] p-1">
        {(["upcoming", "past"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-10 flex-1 rounded-[10px] text-sm ${tab === t ? "bg-gold font-extrabold text-on-gold" : "font-semibold text-mu"}`}
          >
            {t === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      {bookings.error && <LoadError what="your tickets" onRetry={() => s.userId && retry(bookingsKey(s.userId))} />}
      {!bookings.data && !bookings.error && <ScreenFallback />}

      {bookings.data && !list.length && (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line px-6 py-12 text-center">
          <div className="relative h-14 w-[84px] rounded-[10px] border-[1.5px] border-gold" aria-hidden>
            <span className="absolute -left-2 top-[18px] h-4 w-4 rounded-full border-r-[1.5px] border-gold bg-bg" />
            <span className="absolute -right-2 top-[18px] h-4 w-4 rounded-full border-l-[1.5px] border-gold bg-bg" />
          </div>
          <span className="font-display text-xl font-semibold">{tab === "upcoming" ? "No upcoming tickets" : "No past bookings"}</span>
          <span className="text-sm text-mu">Tickets you book will show up here.</span>
          <Link href={bookHref} className="btn btn-gold mt-1.5 h-[50px] px-[26px] text-[15px]">
            Book a movie
          </Link>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(380px,100%),1fr))] gap-3.5">
        {list.map((b) => (
          <Link key={b.ref} href={`/tickets/${b.ref}`} className="card card-link flex gap-4 rounded-[18px] p-3.5">
            <div className="poster-deep relative aspect-[2/3] w-[78px] flex-none rounded-[10px]">
              <Poster path={b.movie.poster} title={b.movie.title} sizes="78px" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[17px] font-extrabold">{b.movie.title}</span>
                {b.upcoming ? (
                  <Badge>CONFIRMED</Badge>
                ) : b.status === "Cancelled" ? (
                  <Badge tone="err">CANCELLED</Badge>
                ) : b.status === "Refunded" ? (
                  <Badge tone="err">{b.refund === "refunding" ? "REFUND PROCESSING" : "REFUNDED"}</Badge>
                ) : (
                  <Badge tone="muted">COMPLETED</Badge>
                )}
              </div>
              <span className="text-[13.5px] text-mu">
                {b.branchName}, {b.city}
              </span>
              <span className="text-sm font-semibold">
                {b.date} · {b.start}
              </span>
              <span className="mt-auto text-[13px] text-mu">
                {ticketCount(b.tickets.length)} · {b.tickets.map((x) => x.label).join(", ")}
              </span>
            </div>
            <span className="self-center text-mu">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
