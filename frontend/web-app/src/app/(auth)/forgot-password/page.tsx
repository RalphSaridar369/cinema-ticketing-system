"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Field, Spinner } from "@/components/ui";
import { actions } from "@/lib/store";
import { useForm } from "@/lib/use-form";
import { emailOk } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const form = useForm({ email: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sent)
    return (
      <div className="mt-10 flex flex-col items-center gap-3.5 text-center">
        <CheckCircle />
        <h1 className="font-display text-[28px] font-semibold tracking-[-.02em]">Check your email</h1>
        <p className="text-[15px] leading-normal text-mu">
          If <strong className="text-tx">{form.values.email}</strong> has an account, we sent it a link to reset your password.
        </p>
        <Link href="/login" className="btn btn-gold mt-3 h-[54px] w-full text-base">
          Back to log in
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!form.check([["email", emailOk, "Enter a valid email address"]])) return;
        setBusy(true);
        const err = await actions.sendPasswordReset(form.values.email.trim());
        setBusy(false);
        setError(err);
        if (!err) setSent(true);
      }}
      className="flex flex-col gap-[18px]"
    >
      <Link href="/login" className="self-start text-sm font-semibold text-mu hover:text-tx">
        ← Back to log in
      </Link>
      <div className="mt-5 flex flex-col gap-2">
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-.02em]">Forgot your password?</h1>
        <p className="text-[15px] leading-normal text-mu">Enter the email you registered with and we’ll send you a link to reset it.</p>
      </div>
      <Field label="Email" type="email" autoComplete="email" placeholder="name@example.com" {...form.bind("email")} />
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-err">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-gold h-[54px] text-base disabled:text-tx!">
        {busy ? (
          <>
            <Spinner /> Sending…
          </>
        ) : (
          "Send reset link"
        )}
      </button>
    </form>
  );
}
