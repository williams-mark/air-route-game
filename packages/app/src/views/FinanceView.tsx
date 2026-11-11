import { useMemo } from "react";
import { CREDIT_PARAMS, DIVERSITY_PARAMS, dayToDate, maintenanceEnabled } from "@arg/sim";
import { monthly, type CostKey, type DayRecord, type MonthRecord } from "../sim/finance";
import { formatDate, formatMoney } from "../sim/format";
import { bridge, useSimSelector } from "../sim/useSim";

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
  ["Fleet types", (m) => -m.by.diversity, "diversity"],
  ["Interest", (m) => -m.by.interest, "interest"],
  ["Profit", (m) => m.profit, null],
];

/** The credit line: limit, how much of it is drawn, interest, and where the delivery balances on open orders leave it. */
function CreditPanel() {
  const credit = useSimSelector((s) => s.credit);
  const cash = useSimSelector((s) => s.cash);
  if (!credit) return null;
  const used = credit.limitUsd > 0 ? Math.min(1, credit.drawnUsd / credit.limitUsd) : 0;
  const tone = credit.drawnUsd > credit.limitUsd ? "over" : used >= 0.75 ? "warn" : "";
  return (
    <section className="panel-box" aria-label="Credit line">
      <h2>Credit line</h2>
      <p className="foot-note" style={{ margin: 0 }}>
        Cash may go below zero up to the limit, at {(credit.annualRate * 100).toFixed(0)}% interest a year on the overdrawn amount, charged daily. The limit is a {formatMoney(CREDIT_PARAMS.baseLimitUsd)} base line plus {Math.round(CREDIT_PARAMS.fleetAdvanceRate * 100)}% of the value of aircraft you own outright plus {CREDIT_PARAMS.revenueMonths} months of revenue.
      </p>
      <div className="credit-bar" role="img" aria-label={`${formatMoney(credit.drawnUsd)} of the ${formatMoney(credit.limitUsd)} credit line is drawn`}><span style={{ width: `${(used * 100).toFixed(1)}%` }} /></div>
      <dl className="credit-grid">
        <div><dt>Limit</dt><dd>{formatMoney(credit.limitUsd)}</dd></div>
        <div><dt>Drawn (overdrawn cash)</dt><dd className={credit.drawnUsd > 0 ? "neg" : ""}>{formatMoney(credit.drawnUsd)}</dd></div>
        <div><dt>Headroom</dt><dd className={credit.headroomUsd < 0 ? "neg" : ""}>{formatMoney(credit.headroomUsd)}</dd></div>
        <div><dt>Interest rate</dt><dd>{(credit.annualRate * 100).toFixed(1)}% a year</dd></div>
        <div><dt>Interest today</dt><dd>{formatMoney(credit.interestPerDayUsd)}</dd></div>
        <div><dt>Interest paid, total</dt><dd>{formatMoney(credit.interestPaidUsd)}</dd></div>
        <div><dt>Owed at delivery (open orders)</dt><dd>{formatMoney(credit.owedAtDeliveryUsd)}</dd></div>
        <div><dt>Cash after those balances</dt><dd className={credit.cashAfterBalancesUsd < 0 ? "neg" : ""}>{formatMoney(credit.cashAfterBalancesUsd)}</dd></div>
      </dl>
      {credit.distress ? (
        <p className="credit-status bad" role="status">Distress: cash {formatMoney(cash)} is beyond the limit. {credit.distress.daysLeft} days left before bankruptcy. Sell idle aircraft you own (Fleet), close routes or cancel pending orders to get back within the line.</p>
      ) : tone === "warn" ? (
        <p className="credit-status" role="status">More than three quarters of the credit line is drawn.</p>
      ) : null}
    </section>
  );
}

/** Fleet commonality: how many aircraft types are in service, how many are free, and what the extra ones cost each month. */
function DiversityPanel() {
  const d = useSimSelector((s) => s.diversity);
  if (!d) return null;
  return (
    <section className="panel-box" aria-label="Fleet types">
      <h2>Fleet types</h2>
      <p className="foot-note" style={{ margin: 0 }}>
        Every aircraft type beyond the first {d.freeTypes} adds crew training, spares and operations overhead: {formatMoney(DIVERSITY_PARAMS.perExtraTypeMonthlyUsd)} a month plus {formatMoney(DIVERSITY_PARAMS.perExtraTypePerAircraftMonthlyUsd)} for each aircraft in the fleet.
        Sell or return the last aircraft of a type to stop paying for it.
      </p>
      <dl className="credit-grid">
        <div><dt>Types in service</dt><dd>{d.types} ({d.freeTypes} free)</dd></div>
        <div><dt>Extra types</dt><dd className={d.extraTypes > 0 ? "neg" : ""}>{d.extraTypes}</dd></div>
        <div><dt>Aircraft</dt><dd>{d.fleetSize}</dd></div>
        <div><dt>Type overhead</dt><dd className={d.monthlyUsd > 0 ? "neg" : ""}>{formatMoney(d.monthlyUsd)} a month</dd></div>
      </dl>
    </section>
  );
}

/** Deposits and lease down payments paid on aircraft orders (sim cash log), by month, newest first. They are cash out but not a P&L cost. */
function DepositsPanel() {
  useSimSelector((s) => s.ledger); // re-render as days pass
  const log = (bridge.getSim?.()?.world.cashLog ?? []).filter((e) => /deposit|down payment/i.test(e.text));
  if (log.length === 0) return null;
  const byMonth = new Map<string, number>();
  for (const e of log) {
    const d = dayToDate(e.day);
    const k = `${d.year}-${String(d.month + 1).padStart(2, "0")}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + -e.amountUsd);
  }
  const total = log.reduce((s, e) => s - e.amountUsd, 0);
  const recent = [...log].reverse().slice(0, 8);
  return (
    <section className="panel-box" aria-label="Aircraft deposits">
      <h2>Aircraft deposits</h2>
      <p className="foot-note" style={{ margin: 0 }}>
        Deposits on purchases and lease down payments are paid in cash when you order. They are not in the monthly P&amp;L below (a purchase deposit becomes part of the aircraft's price, a lease down payment is not refunded), but they reduce cash. Total paid: {formatMoney(total)}.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th scope="col">Month</th><th scope="col" className="num">Deposits paid</th></tr></thead>
          <tbody>{[...byMonth].reverse().slice(0, 12).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className="num neg">{formatMoney(-v)}</td></tr>)}</tbody>
        </table>
      </div>
      <ul className="foot-note">{recent.map((e, i) => <li key={i}>{formatDate(e.day)}: {e.text} ({formatMoney(e.amountUsd)})</li>)}</ul>
    </section>
  );
}

export default function FinanceView() {
  const ledger = useSimSelector((s) => s.ledger);
  const cash = useSimSelector((s) => s.cash);
  const months = useMemo(() => monthly(ledger), [ledger]);
  // Maintenance is suspended (sim MAINTENANCE_ENABLED): hide its column unless an older save has maintenance costs in it.
  // Interest only appears once there has been some.
  const cols = useMemo(() => COLS.filter(([c]) => (c !== "Maintenance" || maintenanceEnabled() || months.some((m) => m.by.maintenance !== 0)) && (c !== "Interest" || months.some((m) => m.by.interest !== 0)) && (c !== "Fleet types" || months.some((m) => m.by.diversity !== 0))), [months]);
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
      <CreditPanel />
      <DiversityPanel />
      <DepositsPanel />
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
