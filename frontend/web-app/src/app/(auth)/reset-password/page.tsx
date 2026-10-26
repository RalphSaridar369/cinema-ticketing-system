"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Field, Spinner } from "@/components/ui";
import { actions } from "@/lib/store";
import { useForm } from "@/lib/use-form";
import { minLength } from "@/lib/validation";

export default function ResetPasswordPage() {
  const form = useForm({ password: "", confirm: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (done)
    return (
      <div className="mt-10 flex flex-col items-center gap-3.5 text-center">
        <CheckCircle />
        <h1 className="font-display text-[28px] font-semibold tracking-[-.02em]">Password updated</h1>
        <p className="text-[15px] text-mu">You can now log in with your new password.</p>
        <Link href="/login" className="btn btn-gold mt-3 h-[54px] w-full text-base">
          Go to log in
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = form.check([
          ["password", minLength(8), "Use at least 8 characters"],
          ["confirm", (v, f) => !!v && v === f.password, "Passwords do not match"],
        ]);
        if (!ok) return;
        setBusy(true);
        const err = await actions.setPassword(form.values.password);
        if (!err) await actions.logOut();
        setBusy(false);
        setError(err && /session/i.test(err) ? "This reset link is invalid or has expired. Request a new one." : err);
        if (!err) setDone(true);
      }}
      className="flex flex-col gap-[18px]"
    >
      <div className="mt-5 flex flex-col gap-2">
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-.02em]">Set a new password</h1>
        <p className="text-[15px] text-mu">Use at least 8 characters.</p>
      </div>
      <Field label="New password" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...form.bind("password")} />
      <Field label="Confirm password" type="password" autoComplete="new-password" placeholder="Repeat new password" {...form.bind("confirm")} />
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-err">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-gold h-[54px] text-base disabled:text-tx!">
        {busy ? (
          <>
            <Spinner /> Saving…
          </>
        ) : (
          "Save"
        )}
      </button>
    </form>
  );
}
