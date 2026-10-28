"use client";

import { useRouter } from "next/navigation";
import type { Showtime } from "@/lib/catalog";
import { money } from "@/lib/data";
import { say } from "@/lib/store";

export function useOpenShowtime() {
  const router = useRouter();
  return (st: Showtime) => {
    if (st.soldOut) return say("This showtime is sold out");
    router.push(`/book/${st.id}`);
  };
}

// Compact time chip used on the branch listing.
export function ShowtimeChip({ st }: { st: Showtime }) {
  const open = useOpenShowtime();
  if (st.soldOut)
    return (
      <button
        onClick={() => open(st)}
        aria-label={`${st.start}, sold out`}
        className="flex min-w-[76px] cursor-not-allowed flex-col gap-1 rounded-[10px] border border-dashed border-line px-2.5 py-2 text-left opacity-55"
      >
        <span className="text-[15px] font-bold line-through">{st.start}</span>
        <span className="font-mono text-[9.5px] font-medium tracking-[.04em]">SOLD OUT</span>
      </button>
    );
  return (
    <button onClick={() => open(st)} className="card-link flex min-w-[76px] flex-col gap-1 rounded-[10px] border border-line bg-bg px-2.5 py-2 text-left">
      <span className="text-[15px] font-extrabold">{st.start}</span>
      <span className="font-mono text-[9.5px] font-medium uppercase tracking-[.04em] text-gold-ink">{st.room.format}</span>
    </button>
  );
}

// Full-width row used on the movie details page.
// `left` is the live seats-left count; undefined while it loads.
export function ShowtimeRow({ st, left }: { st: Showtime; left?: number }) {
  const open = useOpenShowtime();
  if (st.soldOut || left === 0)
    return (
      <div className="flex items-center gap-3.5 rounded-[14px] border border-dashed border-line px-4 py-3.5 opacity-60">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[17px] font-bold line-through">
            {st.start} – {st.end}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-mu">{st.room.name}</span>
            <span className="tag">{st.room.format}</span>
          </div>
        </div>
        <span className="rounded-md bg-s3 px-[9px] py-[5px] font-mono text-[11px] font-semibold tracking-[.06em]">SOLD OUT</span>
      </div>
    );
  return (
    <button onClick={() => open(st)} className="card card-link flex items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-left">
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-[17px] font-extrabold">
          {st.start} <span className="font-medium text-mu">– {st.end}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-mu">{st.room.name}</span>
          <span className="tag text-gold-ink">{st.room.format}</span>
          {left !== undefined && left <= 12 && <span className="text-xs font-bold text-err">{left} left</span>}
        </div>
      </div>
      <span className="text-base font-extrabold">{money(st.price)}</span>
      <span className="text-mu">›</span>
    </button>
  );
}
