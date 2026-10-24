"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { initials, useApp } from "@/components/app-shell";
import { Field, Modal, SelectField } from "@/components/ui";
import { CITIES } from "@/lib/data";
import { actions, say, setState, type Profile, type Theme } from "@/lib/store";

const FIELDS: [keyof Profile, string, string][] = [
  ["first", "First name", "text"],
  ["last", "Last name", "text"],
  ["email", "Email", "email"],
  ["phone", "Phone", "tel"],
  ["dob", "Date of birth", "date"],
];

export default function ProfilePage() {
  const s = useApp();
  const router = useRouter();
  const [draft, setDraft] = useState<Profile>(s.profile);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="px-page-narrow flex flex-col gap-5 pb-10 pt-4">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-s3 font-display text-[22px] font-semibold">{initials(s)}</div>
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[22px] font-semibold">
            {s.profile.first} {s.profile.last}
          </h1>
          <span className="text-sm text-mu">{s.profile.email}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setState({ profile: draft });
            say("Profile saved");
          }}
          className="card flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-[20px] p-5"
        >
          <h2 className="font-display text-lg font-semibold">Personal details</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
            {FIELDS.map(([k, label, type]) => (
              <Field key={k} label={label} type={type} value={draft[k]} onChange={set(k)} className="h-12 bg-bg px-3.5 [color-scheme:inherit]" />
            ))}
            <SelectField label="Gender" value={draft.gender} onChange={set("gender")} className="h-12 bg-bg text-[15px]">
              <option>Female</option>
              <option>Male</option>
              <option>Prefer not to say</option>
            </SelectField>
            <SelectField label="City" value={draft.city} onChange={set("city")} className="h-12 bg-bg text-[15px]">
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option>Other</option>
            </SelectField>
          </div>
          <button type="submit" className="btn btn-gold h-[50px] self-start px-[26px] text-[15px]">
            Save changes
          </button>
        </form>

        <div className="flex flex-[1_1_300px] flex-col gap-3">
          <nav className="card overflow-hidden rounded-[20px]">
            <MenuRow href="/profile/password" label="Change password" />
            <MenuRow href="/profile/favorites" label="Favorites" count={s.favorites.length} />
            <MenuRow href="/profile/watchlist" label="Watchlist" count={s.watchlist.length} last />
          </nav>
          <div className="card flex items-center justify-between rounded-[20px] px-[18px] py-3">
            <span className="text-[15px] font-semibold">Theme</span>
            <div className="flex gap-0.5 rounded-lg border border-line bg-bg p-[3px]">
              {(["dark", "light"] as Theme[]).map((t) => (
                <button
                  key={t}
                  aria-pressed={s.theme === t}
                  onClick={() => setState({ theme: t })}
                  className={`rounded-md px-3 py-[5px] text-[13px] capitalize ${s.theme === t ? "bg-gold font-bold text-on-gold" : "text-mu"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setConfirmLogout(true)} className="btn h-[54px] border border-err text-[15px] text-err">
            Log out
          </button>
        </div>
      </div>

      {confirmLogout && (
        <Modal onClose={() => setConfirmLogout(false)}>
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[22px] font-semibold">Log out?</h2>
            <p className="text-[15px] leading-normal text-mu">You’ll need to log in again to book seats or open your tickets.</p>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <button autoFocus onClick={() => setConfirmLogout(false)} className="btn h-[50px] border border-line text-[15px] font-bold">
                Cancel
              </button>
              <button
                onClick={() => {
                  actions.logOut();
                  router.replace("/login");
                }}
                className="btn h-[50px] bg-err text-[15px] text-white"
              >
                Log out
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MenuRow({ href, label, count, last }: { href: string; label: string; count?: number; last?: boolean }) {
  return (
    <Link href={href} className={`flex h-[58px] items-center justify-between px-[18px] text-[15px] font-semibold hover:bg-s2 ${last ? "" : "border-b border-line"}`}>
      <span>{label}</span>
      <span className="text-mu">{count ? `${count} ›` : "›"}</span>
    </Link>
  );
}
