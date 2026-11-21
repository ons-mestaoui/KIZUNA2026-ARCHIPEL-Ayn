"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import type { FarmDTO } from "@/lib/farm-types";
import { fmt } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/useLang";
import { type Form, fromFarm, initialForm, todayISO, toPayload, validateStep } from "./form";
import { CropStep, LocationStep, SoilStep, WaterStep } from "./steps";

const STEPS = 4;

export function Wizard() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initialForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default planting date = 30 days ago (computed here, not at render, so prerendering stays deterministic).
  useEffect(() => {
    setForm((f) => (f.plantingDate ? f : { ...f, plantingDate: todayISO(-30) }));
  }, []);

  // Editing an existing farm? Preload it.
  useEffect(() => {
    let alive = true;
    fetch("/api/farm")
      .then((r) => (r.ok ? (r.json() as Promise<{ farm: FarmDTO | null }>) : { farm: null }))
      .then(({ farm }) => {
        if (alive && farm) {
          setForm(fromFarm(farm));
          setEditing(true);
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const set = (patch: Partial<Form>) => {
    setError(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  async function next() {
    const problem = validateStep(step, form, t);
    if (problem) return setError(problem);
    setError(null);
    if (step < STEPS - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/farm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, lang, t.onboarding.location.farmNameDefault)),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.push("/app");
      router.refresh();
    } catch {
      setError(t.onboarding.errors.generic);
      setSaving(false);
    }
  }

  const stepProps = { form, set };
  const last = step === STEPS - 1;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[560px] flex-col">
      <header className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <Logo href="/app" />
          <LangSwitch />
        </div>
        <div className="mt-3" aria-hidden>
          <div className="flex gap-1.5">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-line"}`} />
            ))}
          </div>
        </div>
        <p className="mt-3 text-[14px] text-ink-soft" aria-live="polite">
          {fmt(t.onboarding.stepOf, { n: step + 1, total: STEPS })}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight">{t.onboarding.steps[step]}</h1>
      </header>

      <main className="flex-1 px-4 pt-4 pb-28">
        {loading ? (
          <p className="text-ink-soft">{t.common.loading}</p>
        ) : (
          <>
            {step === 0 && <LocationStep {...stepProps} />}
            {step === 1 && <CropStep {...stepProps} />}
            {step === 2 && <WaterStep {...stepProps} />}
            {step === 3 && <SoilStep {...stepProps} />}
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-alarm/10 px-3 py-2 text-[15px] text-alarm">
            {error}
          </p>
        )}
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-[1200] border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 px-4 pt-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(step - 1);
              }}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-paper px-4 font-medium"
            >
              <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden />
              {t.common.back}
            </button>
          ) : editing ? (
            <Link href="/app" className="inline-flex h-12 items-center rounded-xl border border-line bg-paper px-4 font-medium">
              {t.common.cancel}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={next}
            disabled={saving || loading}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[16px] font-medium text-paper disabled:opacity-60"
          >
            {last ? (saving ? t.onboarding.saving : t.onboarding.save) : t.common.next}
            {!last && <ArrowRight size={18} className="rtl:rotate-180" aria-hidden />}
          </button>
        </div>
      </nav>
    </div>
  );
}
