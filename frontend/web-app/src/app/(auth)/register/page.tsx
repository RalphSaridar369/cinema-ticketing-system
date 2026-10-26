"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle, Field, SelectField, Spinner } from "@/components/ui";
import { CITIES, GENDERS } from "@/lib/data";
import { actions } from "@/lib/store";
import { useForm } from "@/lib/use-form";
import { emailOk, minLength, phoneOk, required } from "@/lib/validation";

export default function RegisterPage() {
  const router = useRouter();
  const form = useForm({ first: "", last: "", email: "", phone: "", password: "", confirm: "", dob: "", gender: "", city: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = form.check([
      ["first", required, "First name is required"],
      ["last", required, "Last name is required"],
      ["email", emailOk, "Enter a valid email address"],
      ["phone", phoneOk, "Enter a valid phone number"],
      ["password", minLength(8), "Use at least 8 characters"],
      ["confirm", (v, f) => !!v && v === f.password, "Passwords do not match"],
    ]);
    if (!ok) return;
    const v = form.values;
    setBusy(true);
    const res = await actions.register({ ...v, first: v.first.trim(), last: v.last.trim(), email: v.email.trim() });
    setBusy(false);
    setError(res.error);
    if (res.error) return;
    if (res.confirm) setConfirmSent(true);
    else router.replace("/");
  };

  if (confirmSent)
    return (
      <div className="mt-10 flex flex-col items-center gap-3.5 text-center">
        <CheckCircle />
        <h1 className="font-display text-[28px] font-semibold tracking-[-.02em]">Confirm your email</h1>
        <p className="text-[15px] leading-normal text-mu">
          We sent a confirmation link to <strong className="text-tx">{form.values.email}</strong>. Open it to finish creating your account.
        </p>
        <Link href="/login" className="btn btn-gold mt-3 h-[54px] w-full text-base">
          Go to log in
        </Link>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <Link href="/login" className="self-start text-sm font-semibold text-mu hover:text-tx">
        ← Back to log in
      </Link>
      <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-.02em]">Create your account</h1>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        <Field label="First name" autoComplete="given-name" placeholder="Rami" {...form.bind("first")} />
        <Field label="Last name" autoComplete="family-name" placeholder="Haddad" {...form.bind("last")} />
        <Field label="Email" type="email" autoComplete="email" placeholder="name@example.com" {...form.bind("email")} />
        <Field label="Phone" type="tel" autoComplete="tel" placeholder="+961 70 123 456" {...form.bind("phone")} />
        <Field label="Password" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...form.bind("password")} />
        <Field label="Confirm password" type="password" autoComplete="new-password" placeholder="Repeat password" {...form.bind("confirm")} />
      </div>
      <div className="flex items-center gap-3 font-mono text-[11px] font-medium tracking-[.08em] text-mu">
        <span>OPTIONAL</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-3.5">
        <Field label="Date of birth" type="date" className="px-2.5 text-sm" {...form.bind("dob")} />
        <SelectField label="Gender" name="gender" value={form.values.gender} onChange={form.bind("gender").onChange}>
          <option value="">Select</option>
          {GENDERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField label="City" name="city" value={form.values.city} onChange={form.bind("city").onChange}>
          <option value="">Select</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option>Other</option>
        </SelectField>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-err">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-gold mt-1 h-[54px] text-base disabled:text-tx!">
        {busy ? (
          <>
            <Spinner /> Creating account…
          </>
        ) : (
          "Register"
        )}
      </button>
      <p className="text-center text-sm text-mu">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-tx underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
