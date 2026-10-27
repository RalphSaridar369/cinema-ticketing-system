"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-shell";
import { BackLink, EmptyState, LoadError, PageTitle, ScreenFallback } from "@/components/ui";
import { CATALOG_KEY, cities, retry, useCatalog, type Branch } from "@/lib/catalog";
import { say, setState } from "@/lib/store";

export default function BranchesPage() {
  const s = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const catalog = useCatalog();
  const c = catalog.data;

  const groups = (c ? cities(c) : []).map((city) => ({
    city,
    items: c!.branches.filter((b) => b.city === city && (!ql || `${b.name} ${b.city} ${b.addr}`.toLowerCase().includes(ql))),
  })).filter((g) => g.items.length);

  const pick = (b: Branch | null) => {
    setState({ branch: b ? b.id : null });
    if (b) router.push(`/branches/${b.slug}`);
    else {
      say("Showing all branches");
      router.push("/");
    }
  };

  return (
    <div className="px-page flex flex-col gap-4 pb-10 pt-4">
      <BackLink href="/" />
      <PageTitle>Choose a cinema</PageTitle>
      <input
        type="search"
        aria-label="Search branch or city"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search branch or city"
        className="field h-[50px]"
      />

      {!ql && (
        <button onClick={() => pick(null)} className="card card-link flex items-center gap-3.5 rounded-2xl px-[18px] py-4 text-left">
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold">All branches</span>
              {s.branch == null && <Selected />}
            </div>
            <span className="text-[13.5px] text-mu">Browse every movie playing across Beirut, Jounieh and Tripoli</span>
          </div>
          <span className="text-lg text-mu">›</span>
        </button>
      )}

      {catalog.error && <LoadError what="branches" onRetry={() => retry(CATALOG_KEY)} />}
      {!c && !catalog.error && <ScreenFallback />}
      {c && !groups.length && <EmptyState>No branches match “{q}”.</EmptyState>}

      {groups.map((g) => (
        <section key={g.city} className="flex flex-col gap-3">
          <div className="mt-2 flex items-baseline gap-2.5">
            <h2 className="font-mono text-xs font-medium tracking-[.12em] text-gold-ink">{g.city.toUpperCase()}</h2>
            <span className="text-xs text-mu">
              {g.items.length} {g.items.length === 1 ? "branch" : "branches"}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3">
            {g.items.map((b) => (
              <button key={b.id} onClick={() => pick(b)} className="card card-link flex gap-3.5 rounded-2xl px-[18px] py-4 text-left">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[17px] font-bold">{b.name}</span>
                    {b.id === s.branch && <Selected />}
                  </div>
                  <span className="text-[13.5px] text-mu">{b.addr}</span>
                  <span className="text-[13.5px] text-mu">{b.phone}</span>
                </div>
                <span className="self-center text-lg text-mu">›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Selected() {
  return <span className="rounded-[5px] bg-gold px-[7px] py-[3px] font-mono text-[10px] font-semibold text-on-gold">SELECTED</span>;
}
