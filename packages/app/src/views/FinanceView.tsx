import { monthRows, profitOf } from "../dev/viewData";
import { formatMoney } from "../sim/format";

function ProfitChart() {
  const W = 760, H = 240, L = 52, R = 12, T = 14, B = 28;
  const vals = monthRows.map(profitOf);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const bw = (W - L - R) / vals.length;
  const ticks = [min, (min + max) / 2, max];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Profit by month, 2015. Range ${formatMoney(min)} to ${formatMoney(max)}.`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{formatMoney(t)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero" />
      {vals.map((v, i) => (
        <g key={i}>
          <rect x={L + i * bw + bw * 0.18} width={bw * 0.64} y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="2" className={v >= 0 ? "bar-pos" : "bar-neg"}>
            <title>{`${monthRows[i]!.month}: ${formatMoney(v, { sign: true })}`}</title>
          </rect>
          <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="axis">{monthRows[i]!.month}</text>
        </g>
      ))}
    </svg>
  );
}

export default function FinanceView() {
  const totals = monthRows.reduce((a, m) => ({ revenue: a.revenue + m.revenue, profit: a.profit + profitOf(m) }), { revenue: 0, profit: 0 });
  const cols: Array<[string, (m: (typeof monthRows)[number]) => number]> = [
    ["Revenue", (m) => m.revenue], ["Fuel", (m) => -m.fuel], ["Crew", (m) => -m.crew], ["Maintenance", (m) => -m.maintenance],
    ["Airport fees", (m) => -m.fees], ["Other", (m) => -m.other], ["Profit", profitOf],
  ];
  return (
    <div className="page">
      <header className="page-head"><h1>Finance</h1><p>2015 year to date. Demo figures: revenue {formatMoney(totals.revenue)}, profit {formatMoney(totals.profit, { sign: true })}.</p></header>
      <section className="panel-box" aria-label="Profit by month"><h2>Profit by month</h2><ProfitChart /></section>
      <section className="panel-box" aria-label="Monthly profit and loss">
        <h2>Monthly P&amp;L</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Month</th>{cols.map(([c]) => <th key={c} scope="col" className="num">{c}</th>)}</tr></thead>
            <tbody>
              {monthRows.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{m.month}</th>
                  {cols.map(([c, f]) => { const v = f(m); return <td key={c} className={`num ${c === "Profit" ? (v < 0 ? "neg" : "pos") : ""}`}>{formatMoney(v)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
