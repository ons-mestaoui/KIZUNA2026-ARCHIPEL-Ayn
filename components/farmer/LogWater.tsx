"use client";

import { Check, Undo2 } from "lucide-react";
import { useState } from "react";
import type { DailyPlan } from "@/lib/engine/types";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** "Did you water?" — confirm the plan or log another amount; the estimate updates immediately. */
export function LogWater({
  plan,
  logs,
  onChange,
}: {
  plan: DailyPlan;
  logs: { id: number; m3: number }[];
  onChange: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState(false);
  const [amount, setAmount] = useState("");
  const total = logs.reduce((s, l) => s + l.m3, 0);

  async function post(m3: number, source: "plan" | "manual") {
    setBusy(true);
    try {
      await fetch("/api/irrigation", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ m3, source }) });
      onChange();
    } finally {
      setBusy(false);
      setOther(false);
      setAmount("");
    }
  }

  async function undo() {
    const last = logs.at(-1);
    if (!last) return;
    setBusy(true);
    try {
      await fetch(`/api/irrigation?id=${last.id}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  if (logs.length > 0) {
    return (
      <section className="mx-4 my-3 flex items-center justify-between gap-3 rounded-xl bg-leaf/10 px-3.5 py-3" aria-live="polite">
        <p className="flex items-center gap-2 text-[15px] font-medium text-leaf">
          <Check size={18} aria-hidden />
          {fmt(t.today.done.logged, { m3: Math.round(total) })}
        </p>
        <button type="button" onClick={undo} disabled={busy} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium underline underline-offset-4">
          <Undo2 size={16} aria-hidden />
          {t.today.done.undo}
        </button>
      </section>
    );
  }
  if (plan.grossM3 <= 0) return null; // nothing was planned, nothing to confirm

  const value = Number(amount.replace(",", "."));
  return (
    <section className="mx-4 my-3 border-t border-line pt-3">
      <h3 className="font-semibold">{t.today.done.title}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => post(plan.grossM3, "plan")}
          className="h-12 rounded-xl bg-water px-4 font-medium text-paper disabled:opacity-60"
        >
          {t.today.done.plan}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOther((o) => !o)}
          aria-expanded={other}
          className="h-12 rounded-xl border border-line bg-paper px-4 font-medium"
        >
          {t.today.done.other}
        </button>
      </div>
      {other && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value > 0) post(value, "manual");
          }}
        >
          <label className="sr-only" htmlFor="amount">
            {t.today.done.amount}
          </label>
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t.today.done.amount}
            dir="ltr"
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-[16px]"
          />
          <button type="submit" disabled={busy || !(value > 0)} className="h-12 rounded-xl bg-ink px-5 font-medium text-paper disabled:opacity-50">
            {t.today.done.save}
          </button>
        </form>
      )}
    </section>
  );
}
