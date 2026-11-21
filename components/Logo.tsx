import Link from "next/link";

export function Drop({ size = 22 }: { size?: number }) {
  return (
    <svg width={(size * 18) / 22} height={size} viewBox="0 0 18 22" aria-hidden>
      <path d="M9 1C9 1 1.5 10 1.5 14.2a7.5 7.5 0 0 0 15 0C16.5 10 9 1 9 1Z" fill="var(--sun)" />
    </svg>
  );
}

/** The brand name stays in Latin letters in every language. */
export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      dir="ltr"
      className={`inline-flex shrink-0 items-center gap-2 text-[20px] leading-none font-semibold tracking-tight whitespace-nowrap sm:text-[22px] ${className}`}
    >
      <Drop />
      Goutte d&apos;Or
    </Link>
  );
}
