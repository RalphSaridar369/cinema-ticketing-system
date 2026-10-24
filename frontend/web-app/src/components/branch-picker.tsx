"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BRANCHES, CITIES } from "@/lib/data";
import { say, setState, type AppState } from "@/lib/store";

// Header branch pill: opens a dropdown and switches the branch in place.
export function BranchPill({ s, compact }: { s: AppState; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const path = usePathname();
  const router = useRouter();
  const label = s.branch != null ? BRANCHES[s.branch].name : "All branches";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: number | null) => {
    setOpen(false);
    if (id === s.branch) return;
    setState({ branch: id });
    say(id == null ? "Showing all branches" : `Showing ${BRANCHES[id].name}`);
    // A branch page is tied to its URL, so keep the URL in step with the pick.
    if (path.startsWith("/branches/")) router.replace(id == null ? "/" : `/branches/${BRANCHES[id].slug}`);
  };

  return (
    <div ref={root} className="relative">
      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`card flex items-center rounded-full ${compact ? "h-[38px] gap-2 px-3.5 text-[13px]" : "h-[42px] gap-2.5 px-4 text-sm"} ${open ? "border-gold" : ""}`}
      >
        <span className="h-2 w-2 rounded-full bg-gold" />
        {!compact && <span className="text-mu">Branch</span>}
        <strong>{label}</strong>
        <span className={`text-mu transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Branch"
          className="card absolute right-0 top-full z-40 mt-2 max-h-[min(70vh,460px)] w-[min(320px,calc(100vw-40px))] overflow-auto rounded-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,.35)]"
        >
          <Option selected={s.branch == null} onPick={() => pick(null)} title="All branches" sub="Every cinema in Beirut, Jounieh and Tripoli" />
          {CITIES.map((city) => (
            <div key={city} role="group" aria-label={city}>
              <div className="px-3 pb-1 pt-3 font-mono text-[11px] font-medium tracking-[.12em] text-gold-ink">{city.toUpperCase()}</div>
              {BRANCHES.filter((b) => b.city === city).map((b) => (
                <Option key={b.id} selected={s.branch === b.id} onPick={() => pick(b.id)} title={b.name} sub={b.addr} aside={b.dist} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Option({ selected, onPick, title, sub, aside }: { selected: boolean; onPick: () => void; title: string; sub: string; aside?: string }) {
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-s2 ${selected ? "bg-s2" : ""}`}
    >
      <span className={`w-4 flex-none text-sm text-gold-ink ${selected ? "" : "invisible"}`}>✓</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="truncate text-[12.5px] text-mu">{sub}</span>
      </span>
      {aside && <span className="flex-none text-[12.5px] font-bold text-gold-ink">{aside}</span>}
    </button>
  );
}
