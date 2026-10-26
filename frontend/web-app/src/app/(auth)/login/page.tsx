"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Spinner, Wordmark } from "@/components/ui";
import { actions } from "@/lib/store";
import { useForm } from "@/lib/use-form";
import { emailOk, required } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const form = useForm({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = form.check([
      ["email", required, "Email is required"],
      ["email", emailOk, "Enter a valid email address"],
      ["password", required, "Password is required"],
    ]);
    if (!ok) return;
    setBusy(true);
    const err = await actions.logIn(form.values.email.trim(), form.values.password);
    setBusy(false);
    setError(err);
    if (!err) router.replace("/");
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <Wordmark />
      <div className="mt-5 flex flex-col gap-2">
        <h1 className="font-display text-[32px] font-semibold leading-[1.1] tracking-[-.02em]">Welcome back</h1>
        <p className="text-[15px] text-mu">Log in to book seats and see your tickets.</p>
      </div>
      <Field label="Email" type="email" autoComplete="email" placeholder="name@example.com" {...form.bind("email")} />
      <Field label="Password" type="password" autoComplete="current-password" placeholder="Your password" {...form.bind("password")} />
      <Link href="/forgot-password" className="self-end text-sm font-semibold text-gold-ink hover:text-gold">
        Forgot password?
      </Link>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-err">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-gold h-[54px] text-base disabled:text-tx!">
        {busy ? (
          <>
            <Spinner /> Logging in…
          </>
        ) : (
          "Log in"
        )}
      </button>
      <p className="text-center text-sm text-mu">
        New to Velour?{" "}
        <Link href="/register" className="font-bold text-tx underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
