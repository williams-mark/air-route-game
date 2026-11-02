import { useMemo } from "react";
import { dayToDate, maintenanceEnabled } from "@arg/sim";
import { monthly, type CostKey, type DayRecord, type MonthRecord } from "../sim/finance";
import { formatMoney } from "../sim/format";
import { useSimSelector } from "../sim/useSim";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_MONTHS = 24;

function ProfitChart({ months }: { months: MonthRecord[] }) {
  const W = 760, H = 240, L = 56, R = 12, T = 14, B = 34;
  const shown = months.slice(-CHART_MONTHS);
  const vals = shown.map((m) => m.profit);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const bw = (W - L - R) / Math.max(shown.length, 6);
  const ticks = [min, (min + max) / 2, max];
  const last = shown[shown.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Profit by month, ${shown[0]?.label} to ${last?.label}. Range ${formatMoney(min)} to ${formatMoney(max)}.`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{formatMoney(t)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero" />
      {shown.map((m, i) => {
        const partial = m === last && m.days < 28;
        return (
          <g key={m.index}>
            <rect x={L + i * bw + bw * 0.18} width={bw * 0.64} y={Math.min(y(m.profit), y(0))} height={Math.max(1, Math.abs(y(m.profit) - y(0)))} rx="2"
              className={m.profit >= 0 ? "bar-pos" : "bar-neg"} opacity={partial ? 0.55 : 1}>
              <title>{`${m.label}${partial ? " (so far)" : ""}: ${formatMoney(m.profit, { sign: true })}`}</title>
            </rect>
            <text x={L + i * bw + bw / 2} y={H - 18} textAnchor="middle" className="axis">{SHORT[m.month]}</text>
            {(m.month === 0 || i === 0) && <text x={L + i * bw + bw / 2} y={H - 4} textAnchor="middle" className="axis">{m.year}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function CashChart({ ledger }: { ledger: DayRecord[] }) {
  const W = 760, H = 150, L = 56, R = 12, T = 12, B = 22;
  // Thin to about 240 points.
  const step = Math.max(1, Math.ceil(ledger.length / 240));
  const pts = ledger.filter((_, i) => i % step === 0 || i === ledger.length - 1);
  const vals = pts.map((p) => p.cash);
  const max = Math.max(...vals), min = Math.min(...vals);
  const pad = (max - min) * 0.1 || 1e6;
  const lo = min - pad, hi = max + pad;
  const x = (i: number) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.cash).toFixed(1)}`).join(" ");
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const first = dayToDate(ledger[0]!.day), last = dayToDate(ledger[ledger.length - 1]!.day);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cash balance from ${formatMoney(vals[0]!)} to ${formatMoney(vals[vals.length - 1]!)}.`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{formatMoney(t)}</text>
        </g>
      ))}
      <polyline points={line} fill="none" className="cash-line" strokeWidth="2" strokeLinejoin="round" />
      <text x={L} y={H - 4} className="axis">{SHORT[first.month]} {first.year}</text>
      <text x={W - R} y={H - 4} textAnchor="end" className="axis">{SHORT[last.month]} {last.year}</text>
    </svg>
  );
}

const COLS: Array<[string, (m: MonthRecord) => number, CostKey | null]> = [
  ["Revenue", (m) => m.revenue, null],
  ["Fuel", (m) => -m.by.fuel, "fuel"],
  ["Crew", (m) => -m.by.crew, "crew"],
  ["Maintenance", (m) => -m.by.maintenance, "maintenance"],
  ["Airport fees", (m) => -m.by.fees, "fees"],
  ["Sales & overhead", (m) => -m.by.sales, "sales"],
  ["Fleet & corporate", (m) => -m.by.fleet, "fleet"],
  ["Profit", (m) => m.profit, null],
];

export default function FinanceView() {
  const ledger = useSimSelector((s) => s.ledger);
  const cash = useSimSelector((s) => s.cash);
  const months = useMemo(() => monthly(ledger), [ledger]);
  // Maintenance is suspended (sim MAINTENANCE_ENABLED): hide its column unless an older save has maintenance costs in it.
  const cols = useMemo(() => (maintenanceEnabled() || months.some((m) => m.by.maintenance !== 0) ? COLS : COLS.filter(([c]) => c !== "Maintenance")), [months]);
  if (ledger.length === 0) {
    return (
      <div className="page">
        <header className="page-head"><h1>Finance</h1><p>Monthly results from the simulation.</p></header>
        <div className="empty-state"><h2>No results yet</h2><p>Start the clock. Revenue, costs and profit appear here as days are simulated.</p></div>
      </div>
    );
  }
  const year = dayToDate(ledger[ledger.length - 1]!.day).year;
  const ytd = months.filter((m) => m.year === year).reduce((a, m) => ({ revenue: a.revenue + m.revenue, profit: a.profit + m.profit }), { revenue: 0, profit: 0 });
  const rows = [...months].reverse();
  return (
    <div className="page">
      <header className="page-head"><h1>Finance</h1><p>{year} year to date. Results are summed from the daily simulation; the current month is partial.</p></header>
      <section className="fin-stats" aria-label="Summary">
        <div className="fin-stat"><span className="k">Cash</span><span className="v">{formatMoney(cash)}</span></div>
        <div className="fin-stat"><span className="k">Revenue, {year}</span><span className="v">{formatMoney(ytd.revenue)}</span></div>
        <div className="fin-stat"><span className="k">Profit, {year}</span><span className={`v ${ytd.profit >= 0 ? "pos" : "neg"}`}>{formatMoney(ytd.profit, { sign: true })}</span></div>
        <div className="fin-stat"><span className="k">Margin</span><span className={`v ${ytd.profit >= 0 ? "pos" : "neg"}`}>{ytd.revenue > 0 ? `${((ytd.profit / ytd.revenue) * 100).toFixed(1)}%` : "n/a"}</span></div>
      </section>
      <section className="panel-box" aria-label="Profit by month"><h2>Profit by month</h2><ProfitChart months={months} /></section>
      {ledger.length > 1 && <section className="panel-box" aria-label="Cash balance"><h2>Cash balance</h2><CashChart ledger={ledger} /></section>}
      <section className="panel-box" aria-label="Monthly profit and loss">
        <h2>Monthly P&amp;L</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Month</th>{cols.map(([c]) => <th key={c} scope="col" className="num">{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.index}>
                  <th scope="row">{m.label}{m.days < daysIn(m) ? <span className="hint"> so far</span> : null}</th>
                  {cols.map(([c, f]) => { const v = f(m); return <td key={c} className={`num ${c === "Profit" ? (v < 0 ? "neg" : "pos") : ""}`}>{formatMoney(v)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="foot-note">Fleet and corporate costs are aircraft lease, overhead{maintenanceEnabled() ? " and maintenance checks" : ""}. Route costs are summed from each route's weekly ledger divided by seven.</p>
      </section>
    </div>
  );
}

const daysIn = (m: MonthRecord) => new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate();
