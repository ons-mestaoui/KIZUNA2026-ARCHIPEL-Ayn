"use client";

export interface Point {
  date: string;
  value: number | null;
  distKm: number | null;
}

const W = 240;
const H = 70;
const PAD = 8;
const BASE = H - 12;

/** Time always runs left to right, in every language. Gaps (clouds, orbit gaps) are drawn as hollow marks. */
export interface SparkStyle {
  color: string;
  kind: "bars" | "line";
  digits: number;
  domain?: [number, number];
}

export function Spark({ points: pts, style, label }: { points: Point[]; style: SparkStyle; label: string }) {
  const { color, kind, digits, domain } = style;
  const nums = pts.map((p) => p.value).filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  const lo = domain ? domain[0] : kind === "bars" ? 0 : Math.min(...nums) - (Math.max(...nums) - Math.min(...nums) || 1) * 0.15;
  const hi = domain ? domain[1] : Math.max(kind === "bars" ? 2 : -Infinity, ...nums) + (kind === "line" ? (Math.max(...nums) - Math.min(...nums) || 1) * 0.15 : 0);
  const n = pts.length;
  const x = (i: number) => (kind === "bars" ? PAD + ((i + 0.5) * (W - 2 * PAD)) / n : n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (v: number) => BASE - ((v - lo) / (hi - lo || 1)) * (BASE - 14);

  // line segments, broken at gaps
  const segments: string[] = [];
  let run: string[] = [];
  pts.forEach((p, i) => {
    if (p.value === null) {
      if (run.length) segments.push(run.join(" "));
      run = [];
    } else run.push(`${x(i)},${y(p.value)}`);
  });
  if (run.length) segments.push(run.join(" "));

  const lastIdx = (() => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].value !== null) return i;
    return -1;
  })();
  const barW = ((W - 2 * PAD) / n) * 0.56;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ direction: "ltr" }} className="mt-3 block w-full" role="img" aria-label={label}>
      <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--ink-soft)" strokeWidth={0.6} />
      <line x1={PAD} x2={W - PAD} y1={14} y2={14} stroke="var(--line)" strokeWidth={0.5} />
      {kind === "line" &&
        segments.map((s) => (
          <polyline key={s} points={s} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      {pts.map((p, i) =>
        p.value === null ? (
          <circle key={p.date} cx={x(i)} cy={BASE - 4} r={2.4} fill="none" stroke="var(--ink-soft)" strokeWidth={1} />
        ) : kind === "bars" ? (
          <rect
            key={p.date}
            x={x(i) - barW / 2}
            y={Math.min(y(p.value), BASE - 1)}
            width={barW}
            height={Math.max(1, BASE - y(p.value))}
            rx={1.6}
            fill={color}
            fillOpacity={i === lastIdx ? 1 : 0.55}
          />
        ) : (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === lastIdx ? 3.4 : 2.4} fill={color} stroke="var(--paper)" strokeWidth={1.2} />
        ),
      )}
      {/* direct label on the latest value */}
      {lastIdx >= 0 && (
        <text
          x={Math.min(Math.max(x(lastIdx), 14), W - 14)}
          y={Math.max(9, y(pts[lastIdx].value!) - (kind === "bars" ? 4 : 7))}
          fontSize={8}
          fontWeight={600}
          textAnchor="middle"
          fill="var(--ink)"
        >
          {pts[lastIdx].value!.toFixed(digits)}
        </text>
      )}
      <text x={PAD} y={H - 1} fontSize={7} fill="var(--ink-soft)">
        {pts[0].date.slice(5)}
      </text>
      <text x={W - PAD} y={H - 1} fontSize={7} textAnchor="end" fill="var(--ink-soft)">
        {pts[n - 1].date.slice(5)}
      </text>
    </svg>
  );
}
