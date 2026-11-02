import { formatMoney } from "../sim/format";
import type { MonthProfit, SweepPoint } from "./helpers";

function niceTicks(min: number, max: number): number[] {
  return [min, (min + max) / 2, max];
}

/** Bars of profit per month (inspector). */
export function MonthBars({ months, label }: { months: MonthProfit[]; label: string }) {
  const W = 360, H = 150, L = 46, R = 6, T = 8, B = 20;
  const vals = months.map((m) => m.profit);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const bw = (W - L - R) / months.length;
  const best = vals.indexOf(Math.max(...vals));
  return (
    <svg className="chart rp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} Best month ${months[best]?.label ?? ""}, ${formatMoney(vals[best] ?? 0, { sign: true })}.`}>
      {niceTicks(min, max).map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" className="axis">{formatMoney(t)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero" />
      {months.map((m, i) => (
        <g key={m.month}>
          <rect x={L + i * bw + bw * 0.16} width={bw * 0.68} y={Math.min(y(m.profit), y(0))} height={Math.max(1, Math.abs(y(m.profit) - y(0)))} rx="1.5" className={m.profit >= 0 ? "bar-pos" : "bar-neg"}>
            <title>{`${m.label}: ${formatMoney(m.profit, { sign: true })}`}</title>
          </rect>
          <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="axis">{m.label.slice(0, 1)}</text>
        </g>
      ))}
    </svg>
  );
}

/** Weekly profit by frequency (creation). The best bar is outlined and labelled; the chosen frequency gets a marker. */
export function FrequencyBars({ points, bestFreq, current, onPick }: { points: SweepPoint[]; bestFreq: number | null; current: number; onPick?: (f: number) => void }) {
  const W = 360, H = 170, L = 46, R = 6, T = 22, B = 30;
  const vals = points.map((p) => (p.feasible ? p.profit : 0));
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const bw = (W - L - R) / points.length;
  const bestIdx = points.findIndex((p) => p.frequency === bestFreq);
  const bx = (i: number) => L + i * bw + bw / 2;
  const summary = bestFreq ? `Best frequency ${bestFreq} per week, ${formatMoney(points[bestIdx]!.profit, { sign: true })} per week.` : "No feasible frequency.";
  return (
    <svg className="chart rp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly profit by frequency, 1 to ${points.length} per week. ${summary}`}>
      {niceTicks(min, max).map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" className="axis">{formatMoney(t)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero" />
      {points.map((p, i) => (
        <g key={p.frequency}>
          <rect
            x={L + i * bw + bw * 0.14} width={bw * 0.72} y={Math.min(y(vals[i]!), y(0))} height={Math.max(1, Math.abs(y(vals[i]!) - y(0)))} rx="1.5"
            className={`${!p.feasible ? "bar-off" : p.profit >= 0 ? "bar-pos" : "bar-neg"} ${p.frequency === bestFreq ? "bar-best" : ""} ${onPick ? "bar-click" : ""}`}
            onClick={onPick && p.feasible ? () => onPick(p.frequency) : undefined}
          >
            <title>{`${p.frequency}/wk: ${p.feasible ? formatMoney(p.profit, { sign: true }) : "not feasible"}`}</title>
          </rect>
          {(p.frequency === 1 || p.frequency % 7 === 0) && <text x={bx(i)} y={H - 14} textAnchor="middle" className="axis">{p.frequency}</text>}
        </g>
      ))}
      {current >= 1 && current <= points.length && <path d={`M${bx(current - 1) - 4} ${H - 5} L${bx(current - 1) + 4} ${H - 5} L${bx(current - 1)} ${H - 11} Z`} className="mark-current"><title>{`Selected: ${current}/wk`}</title></path>}
      {bestIdx >= 0 && (
        <text x={Math.min(Math.max(bx(bestIdx), L + 30), W - R - 30)} y={T - 8} textAnchor="middle" className="best-label">{`Best ${bestFreq}/wk`}</text>
      )}
      <text x={W - R} y={H - 1} textAnchor="end" className="axis">flights per week, each way</text>
    </svg>
  );
}
