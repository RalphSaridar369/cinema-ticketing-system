"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, SelectField } from "@/components/ui";
import { CITIES } from "@/lib/data";
import { actions } from "@/lib/store";
import { useForm } from "@/lib/use-form";
import { emailOk, minLength, phoneOk, required } from "@/lib/validation";

export default function RegisterPage() {
  const router = useRouter();
  const form = useForm({ first: "", last: "", email: "", phone: "", password: "", confirm: "" });

  const submit = (e: React.FormEvent) => {
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
    const { first, last, email, phone } = form.values;
    actions.register({ first: first.trim(), last: last.trim(), email, phone });
    router.replace("/");
  };

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
        <Field label="Date of birth" type="date" className="px-2.5 text-sm" />
        <SelectField label="Gender" defaultValue="">
          <option value="">Select</option>
          <option>Female</option>
          <option>Male</option>
          <option>Prefer not to say</option>
        </SelectField>
        <SelectField label="City" defaultValue="">
          <option value="">Select</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option>Other</option>
        </SelectField>
      </div>
      <button type="submit" className="btn btn-gold mt-1 h-[54px] text-base">
        Register
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
