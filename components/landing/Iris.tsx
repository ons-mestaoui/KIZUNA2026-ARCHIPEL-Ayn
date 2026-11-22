/**
 * The art behind the hero: contour rings like the lines of a terrain map, which are also ripples on water.
 * Deterministic (no randomness, so server and browser draw the same thing); drawn once, rotated by CSS.
 */
const RINGS = 17;
const POINTS = 144;

function ring(k: number): string {
  const base = 70 + k * 27;
  let d = "";
  for (let i = 0; i <= POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    const wob = 1 + 0.05 * Math.sin(3 * a + k * 0.9) + 0.035 * Math.sin(5 * a - k * 1.7) + 0.02 * Math.sin(9 * a + k * 2.3);
    const r = base * wob;
    d += `${i === 0 ? "M" : "L"}${(500 + r * Math.cos(a)).toFixed(1)} ${(500 + r * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

const PATHS = Array.from({ length: RINGS }, (_, k) => ring(k));

export function Iris({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" fill="none" aria-hidden className={className}>
      <g>
        {PATHS.map((d, k) => (
          <path
            key={k}
            d={d}
            stroke={k % 5 === 2 ? "var(--sun)" : "var(--water)"}
            strokeWidth={k % 5 === 2 ? 1.6 : 1}
            opacity={0.12 + 0.5 * (1 - k / RINGS) ** 1.6}
          />
        ))}
      </g>
    </svg>
  );
}
