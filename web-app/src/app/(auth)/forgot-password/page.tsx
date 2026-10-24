"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Field } from "@/components/ui";
import { useForm } from "@/lib/use-form";
import { emailOk } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const form = useForm({ email: "" });
  const [sent, setSent] = useState(false);

  if (sent)
    return (
      <div className="mt-10 flex flex-col items-center gap-3.5 text-center">
        <CheckCircle />
        <h1 className="font-display text-[28px] font-semibold tracking-[-.02em]">Check your email</h1>
        <p className="text-[15px] leading-normal text-mu">
          We sent a reset link to <strong className="text-tx">{form.values.email}</strong>. It expires in 30 minutes.
        </p>
        <Link href="/reset-password" className="btn btn-gold mt-3 h-[54px] w-full text-base">
          Open reset link (demo)
        </Link>
        <Link href="/login" className="text-sm font-semibold text-mu hover:text-tx">
          Back to log in
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (form.check([["email", emailOk, "Enter a valid email address"]])) setSent(true);
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
      <button type="submit" className="btn btn-gold h-[54px] text-base">
        Send reset link
      </button>
    </form>
  );
}
