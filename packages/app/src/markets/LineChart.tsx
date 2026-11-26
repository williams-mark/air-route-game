import { useId, useMemo, useRef, useState } from "react";
import { formatDate } from "../sim/format";

export interface LinePoint { day: number; value: number }

/**
 * One-series line chart with a hover crosshair and tooltip (keyboard: focus and use the arrow keys). Theme tokens only.
 * A single series needs no legend; the caption names it. `format` prints a value for the axis and tooltip.
 */
export function LineChart({ points, format, label, height = 180, zeroLine = false }: {
  points: readonly LinePoint[]; format: (v: number) => string; label: string; height?: number; zeroLine?: boolean;
}) {
  const W = 720, H = height, L = 64, R = 14, T = 12, B = 24;
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.day), ys = points.map((p) => p.value);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let lo = Math.min(...ys, zeroLine ? 0 : Infinity), hi = Math.max(...ys, zeroLine ? 0 : -Infinity);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
    lo -= pad; hi += pad;
    const x = (d: number) => L + (x1 === x0 ? 0.5 : (d - x0) / (x1 - x0)) * (W - L - R);
    const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
    const ticks = [0, 1, 2, 3].map((k) => lo + pad + ((hi - lo - 2 * pad) * k) / 3);
    return { x, y, ticks, x0, x1 };
  }, [points, zeroLine, H]);
  if (!geo || points.length < 2) return <p className="hint">Not enough history yet: the chart fills in as months pass.</p>;
  const { x, y, ticks } = geo;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const pick = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const sx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i]!.day) - sx) < Math.abs(x(points[best]!.day) - sx)) best = i;
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  const first = points[0]!, last = points[points.length - 1]!;
  return (
    <figure className="lc">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} tabIndex={0}
        onMouseMove={(e) => pick(e.clientX)} onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.max(0, Math.min(points.length - 1, (h ?? points.length - 1) + (e.key === "ArrowLeft" ? -1 : 1)))); }
          if (e.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}>
        <title id={titleId}>{`${label}: ${format(first.value)} on ${formatDate(first.day)}, ${format(last.value)} on ${formatDate(last.day)}`}</title>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="lc-grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="lc-axis">{format(t)}</text>
          </g>
        ))}
        {zeroLine && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="lc-zero" />}
        <text x={L} y={H - 6} className="lc-axis">{formatDate(first.day)}</text>
        <text x={W - R} y={H - 6} textAnchor="end" className="lc-axis">{formatDate(last.day)}</text>
        <path d={d} className="lc-line" fill="none" />
        <circle cx={x(last.day)} cy={y(last.value)} r={4} className="lc-end" />
        {hp && <>
          <line x1={x(hp.day)} x2={x(hp.day)} y1={T} y2={H - B} className="lc-cross" />
          <circle cx={x(hp.day)} cy={y(hp.value)} r={5} className="lc-dot" />
        </>}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
      </svg>
      {hp && <div className="lc-tip" role="status" style={{ left: `${(x(hp.day) / W) * 100}%` }}><b>{format(hp.value)}</b><span>{formatDate(hp.day)}</span></div>}
    </figure>
  );
}
