"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-shell";
import { BackLink, Field } from "@/components/ui";
import { say } from "@/lib/store";
import { useForm } from "@/lib/use-form";
import { minLength, required } from "@/lib/validation";

export default function ChangePasswordPage() {
  useApp();
  const router = useRouter();
  const form = useForm({ current: "", password: "", confirm: "" });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const ok = form.check([
          ["current", required, "Enter your current password"],
          ["password", minLength(8), "Use at least 8 characters"],
          ["confirm", (v, f) => !!v && v === f.password, "Passwords do not match"],
        ]);
        if (!ok) return;
        say("Password changed");
        router.push("/profile");
      }}
      className="flex flex-col gap-4 px-[max(20px,calc((100%-480px)/2))] pb-10 pt-4"
    >
      <BackLink href="/profile">← Profile</BackLink>
      <h1 className="font-display text-[28px] font-semibold tracking-[-.02em]">Change password</h1>
      <Field label="Current password" type="password" autoComplete="current-password" placeholder="Current password" {...form.bind("current")} />
      <Field label="New password" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...form.bind("password")} />
      <Field label="Confirm new password" type="password" autoComplete="new-password" placeholder="Repeat new password" {...form.bind("confirm")} />
      <button type="submit" className="btn btn-gold h-[54px] text-base">
        Save
      </button>
    </form>
  );
}
