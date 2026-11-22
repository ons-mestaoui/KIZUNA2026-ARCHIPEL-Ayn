import Link from "next/link";
import { useId } from "react";
import { BRAND } from "@/lib/brand";

/**
 * The mark: an eye (the satellite looking at the land, the spring that feeds it). The lids are the outline, the iris
 * is drawn as contour rings (the lines on a terrain map, the ripples on water), the pupil is the golden drop.
 */
export function Mark({ height = 22, className = "" }: { height?: number; className?: string }) {
  const id = useId();
  const clip = `ayn-lid-${id.replace(/:/g, "")}`;
  return (
    <svg width={(height * 48) / 32} height={height} viewBox="0 0 48 32" fill="none" aria-hidden className={className}>
      <defs>
        <clipPath id={clip}>
          <path d="M3 16C11 5.5 37 5.5 45 16C37 26.5 11 26.5 3 16Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`} stroke="currentColor" fill="none">
        <circle cx="24" cy="16" r="10.6" strokeWidth="1.3" opacity=".5" />
        <circle cx="24" cy="16" r="7.6" strokeWidth="1.3" opacity=".32" />
      </g>
      <path d="M3 16C11 5.5 37 5.5 45 16C37 26.5 11 26.5 3 16Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M24 9.8C24 9.8 19.8 14.9 19.8 17.6a4.2 4.2 0 0 0 8.4 0C28.2 14.9 24 9.8 24 9.8Z" fill="var(--sun)" />
      <ellipse cx="25.9" cy="18.4" rx=".9" ry="1.5" fill="#fff" opacity=".55" transform="rotate(18 25.9 18.4)" />
    </svg>
  );
}

/** The brand name stays in Latin letters in every language. */
export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      dir="ltr"
      aria-label={BRAND.name}
      className={`inline-flex shrink-0 items-center gap-2.5 text-[22px] leading-none font-semibold tracking-tight whitespace-nowrap sm:text-[24px] ${className}`}
    >
      <Mark />
      {BRAND.name}
    </Link>
  );
}
