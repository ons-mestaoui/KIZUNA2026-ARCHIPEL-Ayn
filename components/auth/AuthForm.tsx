"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { signIn, signUp } from "@/lib/auth-client";
import { DEMO_EMAIL } from "@/lib/demo";
import { useT } from "@/lib/i18n/useLang";
import { clearStateCache } from "@/lib/state-cache";

/** Only follow same-site relative paths after sign-in (no open redirects). */
function safeNext(n: string | null, fallback: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

const field =
  "h-12 w-full rounded-xl border border-line bg-white px-3.5 text-[16px] text-ink placeholder:text-ink-soft/70";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUp = mode === "sign-up";

  function describe(code?: string) {
    const c = (code ?? "").toUpperCase();
    if (c.includes("INVALID_EMAIL_OR_PASSWORD") || c.includes("INVALID_PASSWORD") || c.includes("USER_NOT_FOUND"))
      return t.auth.errors.invalid;
    if (c.includes("USER_ALREADY_EXISTS")) return t.auth.errors.exists;
    if (c.includes("PASSWORD_TOO_SHORT")) return t.auth.errors.short;
    return t.auth.errors.generic;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    try {
      const res = isUp
        ? await signUp.email({ email, password, name: String(f.get("name") ?? "").trim() || email.split("@")[0] })
        : await signIn.email({ email, password });
      if (res.error) {
        setError(describe(res.error.code));
        setBusy(false);
        return;
      }
      clearStateCache(); // a new sign-in starts clean: never show the previous person's saved plan
      // the demo account always opens the demo, not the farmer app
      router.push(email.toLowerCase() === DEMO_EMAIL ? "/demo" : safeNext(params.get("next"), isUp ? "/onboarding" : "/app"));
      router.refresh();
    } catch {
      setError(t.auth.errors.offline);
      setBusy(false);
    }
  }

  const other = isUp ? "/sign-in" : "/sign-up";
  const next = params.get("next");
  const otherHref = next ? `${other}?next=${encodeURIComponent(next)}` : other;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[460px] flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3 py-2">
        <Logo />
        <LangSwitch />
      </header>

      <div className="my-auto py-8">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
          {isUp ? t.auth.signUpTitle : t.auth.signInTitle}
        </h1>

        <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate={false}>
          {isUp && (
            <label className="grid gap-1.5 text-[15px] font-medium">
              {t.common.name}
              <input name="name" type="text" autoComplete="name" className={field} />
            </label>
          )}
          <label className="grid gap-1.5 text-[15px] font-medium">
            {t.common.email}
            <input name="email" type="email" required autoComplete="email" inputMode="email" dir="ltr" className={`${field} text-start`} />
          </label>
          <label className="grid gap-1.5 text-[15px] font-medium">
            {t.common.password}
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isUp ? "new-password" : "current-password"}
              dir="ltr"
              className={`${field} text-start`}
            />
            {isUp && <span className="text-[13px] font-normal text-ink-soft">{t.auth.passwordHint}</span>}
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-alarm/10 px-3 py-2 text-[15px] text-alarm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 h-12 w-full rounded-xl bg-ink text-[16px] font-medium text-paper disabled:opacity-60"
          >
            {busy ? t.common.loading : isUp ? t.common.signUp : t.common.signIn}
          </button>
        </form>

        <p className="mt-5 text-[15px] text-ink-soft">
          {isUp ? t.auth.hasAccount : t.auth.noAccount}{" "}
          <Link href={otherHref} className="font-semibold text-ink underline underline-offset-4">
            {isUp ? t.common.signIn : t.common.signUp}
          </Link>
        </p>
        {isUp && <p className="mt-4 text-[13px] text-ink-soft">{t.auth.noReset}</p>}
      </div>
    </main>
  );
}
