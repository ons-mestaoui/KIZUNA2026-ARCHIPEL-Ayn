"use client";

import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/useLang";
import FieldHero from "./FieldHero";
import type { EquipmentInfo } from "./FieldEquipment";
import type { FieldData } from "./useFieldData";

const SKY = "linear-gradient(#c9d9e3, #eef2ee)";

/** The farmer app's field view: shows whatever satellite data is on hand (fresh, a saved copy, loading or unavailable). */
export default function FieldPanel({ data, equipment, children }: { data: FieldData; equipment?: EquipmentInfo; children?: ReactNode }) {
  const t = useT();
  const { status, field, savedAt, reload } = data;

  if (field && (status === "ready" || status === "loading")) {
    const fieldKey = field.polygon ? field.polygon.map((p) => p.join(",")).join(";") : `${field.sideM}`;
    return (
      <FieldHero key={fieldKey} field={field} savedAt={savedAt} equipment={equipment}>
        {children}
      </FieldHero>
    );
  }
  return (
    <div className="relative h-full w-full" style={{ background: SKY }}>
      <div className="absolute start-3 top-3 z-10">{children}</div>
      <div className="absolute inset-0 grid place-items-center px-6 text-center">
        {status === "unavailable" ? (
          <div role="alert" className="max-w-xs">
            <p className="text-[15px] leading-snug">{t.field.unavailable}</p>
            <button type="button" onClick={reload} className="mx-auto mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-paper px-4 text-[14px] font-medium">
              <RefreshCw size={16} aria-hidden />
              {t.field.retry}
            </button>
          </div>
        ) : (
          <p role="status" className="animate-pulse rounded-full bg-paper/80 px-4 py-2 text-[14px] text-ink-soft">
            {t.field.loading}
          </p>
        )}
      </div>
    </div>
  );
}
