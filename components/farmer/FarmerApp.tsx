"use client";

import { useRouter } from "next/navigation";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { signOut, useSession } from "@/lib/auth-client";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";

// B1 stub — becomes the Today / Week / Leaf / Ask / Satellite / Farm app in blocks B3–B8.
export function FarmerApp() {
  const t = useT();
  const router = useRouter();
  const { data, isPending } = useSession();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[880px] flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3 py-2">
        <Logo href="/app" />
        <LangSwitch />
      </header>
      <section className="py-10">
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">
          {isPending || !data ? t.common.loading : fmt(t.shell.hello, { name: data.user.name })}
        </h1>
        <p className="mt-3 text-ink-soft">{t.shell.soon}</p>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
          className="mt-8 h-12 rounded-xl border border-line bg-paper px-5 font-medium"
        >
          {t.common.signOut}
        </button>
      </section>
    </main>
  );
}
