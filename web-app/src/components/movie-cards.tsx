import Link from "next/link";
import { genreLine, type Movie } from "@/lib/data";

const href = (m: Movie) => `/movies/${m.slug}`;

export function FeatureCard({ m }: { m: Movie }) {
  return (
    <Link href={href(m)} className="group flex w-[clamp(158px,16vw,232px)] flex-none snap-start flex-col gap-1.5">
      <div className="poster relative flex aspect-[2/3] items-end rounded-2xl border border-line p-3 font-mono text-[10px] text-mu transition-colors group-hover:border-gold">
        <span>POSTER</span>
        <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-scrim px-2 py-1 font-sans text-xs font-bold text-white backdrop-blur-md">
          <span className="text-[#e2c07f]">★</span>
          {m.rating.toFixed(1)}
        </span>
      </div>
      <span className="mt-1 text-[15px] font-bold">{m.title}</span>
      <span className="text-[12.5px] text-mu">
        <strong className="text-gold-ink">{m.rating.toFixed(1)}</strong>/10 · {genreLine(m)}
      </span>
    </Link>
  );
}

export function PosterCard({ m, rank, sub }: { m: Movie; rank?: number; sub?: string }) {
  return (
    <Link href={href(m)} className="group flex w-[clamp(124px,12vw,180px)] flex-none flex-col gap-1.5">
      <div className="poster relative aspect-[2/3] rounded-xl border border-line transition-colors group-hover:border-gold">
        {rank != null && <span className="absolute bottom-1.5 left-2.5 font-display text-[34px] font-bold text-gold-ink">{rank}</span>}
      </div>
      <span className="text-sm font-bold">{m.title}</span>
      <span className="text-xs text-mu">{sub ?? genreLine(m)}</span>
    </Link>
  );
}

export function GridPoster({ m }: { m: Movie }) {
  return (
    <Link href={href(m)} className="group flex flex-col gap-1.5">
      <div className="poster aspect-[2/3] rounded-xl border border-line transition-colors group-hover:border-gold" />
      <span className="text-sm font-bold">{m.title}</span>
      <span className="text-xs text-mu">
        ★ {m.rating.toFixed(1)} · {genreLine(m)}
      </span>
    </Link>
  );
}
