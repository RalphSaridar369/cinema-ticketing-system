"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { getDays } from "@/lib/data";
import { useToast } from "@/lib/store";

export function Toast() {
  const msg = useToast();
  if (!msg) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 bottom-24 md:bottom-8 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tx px-[18px] py-3 text-sm font-bold text-bg shadow-[0_10px_30px_rgba(0,0,0,.3)]"
    >
      {msg}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block flex-none animate-spin-fast rounded-full border-gold border-r-transparent"
      style={{ width: size, height: size, borderWidth: size > 30 ? 3 : 2 }}
    />
  );
}

export function Wordmark({ className = "", size = 15 }: { className?: string; size?: number }) {
  return (
    <span className={`font-display font-bold tracking-[.3em] text-gold-ink ${className}`} style={{ fontSize: size }}>
      VELOUR
    </span>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

export function Field({ label, error, className = "", ...input }: FieldProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold text-mu">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? id + "-err" : undefined}
        className={`field ${className}`}
        {...input}
      />
      {error && (
        <span id={id + "-err"} className="text-[13px] font-semibold text-err">
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({ label, children, className = "", ...select }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold text-mu">
        {label}
      </label>
      <select id={id} className={`field px-2.5 text-sm ${className}`} {...select}>
        {children}
      </select>
    </div>
  );
}

// "← Back" that returns to the previous page when there is one, else to `href`.
export function BackLink({ href, children = "← Back" }: { href: string; children?: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="self-start text-sm font-semibold text-mu hover:text-tx"
    >
      {children}
    </Link>
  );
}

export function PageTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h1 className={`font-display text-[clamp(26px,2.6vw,36px)] font-semibold tracking-[-.02em] ${className}`}>{children}</h1>;
}

export function Badge({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "muted" | "err" }) {
  const tones = {
    gold: "bg-gold text-on-gold",
    muted: "border border-line text-mu",
    err: "border border-err text-err",
  };
  return <span className={`flex-none rounded-full px-2 py-1 font-mono text-[10px] font-semibold tracking-[.06em] ${tones[tone]}`}>{children}</span>;
}

export function DayPicker({ value, onChange, compact }: { value: number; onChange: (day: number) => void; compact?: boolean }) {
  const days = getDays();
  return (
    <div role="tablist" aria-label="Date" className={`no-scrollbar flex overflow-x-auto ${compact ? "gap-1.5" : "gap-2"}`}>
      {days.map((d) => {
        const on = d.index === value;
        return (
          <button
            key={d.index}
            role="tab"
            aria-selected={on}
            aria-label={d.label}
            onClick={() => onChange(d.index)}
            className={`flex flex-col items-center justify-center ${compact ? "h-[58px] flex-[1_0_46px] rounded-xl" : "h-[66px] max-w-24 flex-[1_0_54px] rounded-[14px]"} ${
              on ? "bg-gold text-on-gold" : "card"
            }`}
          >
            <span className={`text-[11px] ${on ? "font-bold" : "text-mu"}`}>{d.weekday}</span>
            <span className={`font-display ${compact ? "text-[17px]" : "text-xl"} ${on ? "font-bold" : "font-semibold"}`}>{d.date}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Stars({ value, onRate }: { value: number; onRate: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = value >= n ? "100%" : value >= n - 0.5 ? "50%" : "0%";
        return (
          <div key={n} className="relative h-[34px] w-[34px] text-center text-[32px] leading-[34px]">
            <span className="text-s3">★</span>
            <span className="absolute inset-y-0 left-0 overflow-hidden text-left text-gold" style={{ width: fill }}>
              ★
            </span>
            <button aria-label={`${n - 0.5} stars`} onClick={() => onRate(n - 0.5)} className="absolute inset-y-0 left-0 w-1/2" />
            <button aria-label={`${n} stars`} onClick={() => onRate(n)} className="absolute inset-y-0 right-0 w-1/2" />
          </div>
        );
      })}
    </div>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-40 flex items-center justify-center bg-scrim p-5">
      <div role="dialog" aria-modal onClick={(e) => e.stopPropagation()} className="card w-full max-w-[400px] rounded-[22px] p-[26px]">
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-2.5 rounded-[14px] border border-dashed border-line p-7 text-center text-sm text-mu">{children}</div>;
}

export function CheckCircle() {
  return (
    <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[1.5px] border-gold text-[30px] text-gold-ink" aria-hidden>
      ✓
    </div>
  );
}

export function ScreenFallback() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner size={32} />
    </div>
  );
}

export function NotFoundNote({ title, href, cta }: { title: string; href: string; cta: string }) {
  return (
    <div className="px-page flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <Link href={href} className="btn btn-gold h-[50px] px-6 text-[15px]">
        {cta}
      </Link>
    </div>
  );
}

export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <EmptyState>
      <span>Couldn’t load {what}. Check your connection.</span>
      <button className="font-bold text-gold-ink" onClick={onRetry}>
        Try again
      </button>
    </EmptyState>
  );
}
