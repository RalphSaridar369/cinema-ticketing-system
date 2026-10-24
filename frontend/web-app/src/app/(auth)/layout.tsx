import { RedirectIfAuthed } from "@/components/auth-gate";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <RedirectIfAuthed />
      <aside className="backdrop relative hidden flex-[1.1] flex-col justify-end gap-3.5 border-r border-line p-14 md:flex">
        <span className="absolute left-6 top-6 font-mono text-[11px] text-mu">KEY ART · drop film still</span>
        <p className="max-w-[520px] font-display text-[clamp(40px,4vw,52px)] font-semibold leading-[1.05] tracking-[-.03em]">Your seat is waiting.</p>
        <p className="max-w-[440px] text-[17px] text-mu">
          Five cinemas across Beirut, Jounieh and Tripoli. Pick a showtime, choose your seats, skip the queue.
        </p>
      </aside>
      <main className="flex flex-1 flex-col items-center overflow-auto">
        <div className="my-auto flex w-full max-w-[440px] flex-col gap-[18px] px-6 pb-10 pt-8">{children}</div>
      </main>
    </div>
  );
}
