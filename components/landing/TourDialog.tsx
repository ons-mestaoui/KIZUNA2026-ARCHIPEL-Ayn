"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/useLang";
import { MEDIA } from "./media";
import { ClipSources } from "./VideoLoop";

/**
 * "Watch it work": the short tour in a native <dialog>, which gives a focus trap, Esc to close and an inert page behind
 * it for free. The video is only put on the page while the dialog is open, so it costs nothing until someone asks.
 */
export function TourDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT().landing.video;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    window.dispatchEvent(new CustomEvent("ay-modal", { detail: open })); // the videos behind it rest while it plays
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // a click on the dark backdrop
      }}
      aria-labelledby="ay-tour-title"
      className="m-auto w-[min(94vw,1100px)] max-w-none overflow-visible bg-transparent p-0 text-paper backdrop:bg-night/85 backdrop:backdrop-blur-sm"
    >
      <h2 id="ay-tour-title" className="sr-only">
        {t.title}
      </h2>
      <div className="relative overflow-hidden rounded-[22px] bg-night shadow-[0_40px_120px_-20px_rgb(0_0_0/0.8)] ring-1 ring-paper/15 md:rounded-[30px]">
        {open && (
          <video autoPlay muted loop playsInline controls poster={MEDIA.tour.poster} aria-label={t.tour} className="aspect-[8/5] w-full object-cover">
            <ClipSources clip={MEDIA.tour} />
          </video>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="absolute end-3 top-3 grid size-11 place-items-center rounded-full bg-night/70 text-paper backdrop-blur hover:bg-night"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
    </dialog>
  );
}
