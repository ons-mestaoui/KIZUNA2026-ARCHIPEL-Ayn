"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useLang";

/** A QR code to this app's sign-up page: judges scan it and get a plan for their own location. */
export function JoinCard() {
  const t = useT();
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    // NEXT_PUBLIC_APP_URL lets a laptop demo point the QR at its LAN address instead of "localhost"
    const target = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/sign-up`;
    setUrl(target);
    let alive = true;
    import("qrcode")
      .then((q) => q.toDataURL(target, { margin: 1, width: 240, color: { dark: "#17264a", light: "#ffffff" } }))
      .then((d) => alive && setQr(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-labelledby="join" className="mx-4 my-3 border-t border-line pt-3">
      <h3 id="join" className="font-semibold">
        {t.demo.join.title}
      </h3>
      <p className="mt-1 text-[13px] text-ink-soft">{t.demo.join.text}</p>
      <div className="mt-3 flex items-center gap-4">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={url} width={120} height={120} className="size-28 shrink-0 rounded-lg ring-1 ring-line" />
        ) : (
          <div className="size-28 shrink-0 animate-pulse rounded-lg bg-line" aria-hidden />
        )}
        <div className="min-w-0">
          <Link href="/sign-up" className="inline-flex h-11 items-center rounded-xl bg-ink px-4 text-[15px] font-medium text-paper">
            {t.demo.join.cta}
          </Link>
          <p className="tabular mt-2 text-[12px] break-all text-ink-soft" dir="ltr">
            {url}
          </p>
        </div>
      </div>
    </section>
  );
}
