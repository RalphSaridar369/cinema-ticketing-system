import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="font-display text-[15px] font-bold tracking-[.3em] text-gold-ink">VELOUR</span>
      <h1 className="font-display text-3xl font-semibold tracking-[-.02em]">This page isn’t showing</h1>
      <p className="text-mu">The link may be old, or the page has moved.</p>
      <Link href="/" className="btn btn-gold h-[50px] px-6 text-[15px]">
        Back to home
      </Link>
    </div>
  );
}
