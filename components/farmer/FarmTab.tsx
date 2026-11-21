"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LangSwitch } from "@/components/LangSwitch";
import { signOut } from "@/lib/auth-client";
import { fmt } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/useLang";
import { whenLabel } from "@/lib/format";
import { clearStateCache } from "@/lib/state-cache";
import type { FarmStateDTO } from "@/lib/state-types";

export function FarmTab({ state }: { state: FarmStateDTO }) {
  const t = useT();
  const router = useRouter();
  const locale = useLocale();
  const { farm } = state;
  const rows: [string, string][] = [
    [t.farm.location, farm.placeName ? `${farm.placeName} (${farm.lat.toFixed(3)}, ${farm.lon.toFixed(3)})` : `${farm.lat.toFixed(3)}, ${farm.lon.toFixed(3)}`],
    [t.farm.crop, t.crops[farm.crop as keyof typeof t.crops]],
    [t.farm.area, fmt(t.farm.hectares, { n: farm.areaHa })],
    [t.farm.water, t.sources[farm.waterSource as keyof typeof t.sources].title],
    [t.farm.method, t.methods[farm.irrigationMethod as keyof typeof t.methods]],
    [t.farm.soil, t.soils[farm.soilTexture as keyof typeof t.soils].title],
  ];

  return (
    <section aria-labelledby="farm" className="px-4 py-4">
      <h2 id="farm" className="text-[22px] font-semibold tracking-tight">
        {farm.name}
      </h2>
      <dl className="mt-4 divide-y divide-line border-y border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
            <dt className="text-[14px] text-ink-soft">{k}</dt>
            <dd className="text-[15px] font-medium" dir="auto">
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[13px] text-ink-soft">{fmt(t.farm.updated, { when: whenLabel(Date.parse(state.weather.fetchedAt), locale) })}</p>

      <div className="mt-6 grid gap-3">
        <Link href="/onboarding" className="inline-flex h-12 items-center justify-center rounded-xl bg-ink px-5 font-medium text-paper">
          {t.farm.edit}
        </Link>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-medium">{t.common.language}</span>
          <LangSwitch />
        </div>
        <button
          type="button"
          onClick={async () => {
            clearStateCache(); // don't leave this farmer's plan on a shared phone
            await signOut();
            router.push("/");
            router.refresh();
          }}
          className="h-12 rounded-xl border border-line bg-paper px-5 font-medium"
        >
          {t.common.signOut}
        </button>
      </div>
    </section>
  );
}
