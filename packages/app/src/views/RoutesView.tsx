import { routeRows } from "../dev/viewData";
import { formatMoney } from "../sim/format";

const TIER_LABEL: Record<string, string> = { profit: "Profitable", marginal: "Marginal", loss: "Losing", planned: "Planned" };

export default function RoutesView() {
  return (
    <div className="page">
      <header className="page-head"><h1>Routes</h1><p>{routeRows.length} routes. Demo data from fixtures.</p></header>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th scope="col">Route</th><th scope="col">Aircraft</th><th scope="col" className="num">Freq / wk</th><th scope="col" className="num">Load factor</th><th scope="col" className="num">Profit / wk</th></tr>
          </thead>
          <tbody>
            {routeRows.map((r) => (
              <tr key={r.id}>
                <th scope="row"><span className={`dot tier-${r.tier}`} aria-hidden="true" />{r.route}<span className="sr-only"> ({TIER_LABEL[r.tier]})</span></th>
                <td>{r.aircraft}</td>
                <td className="num">{r.freq}</td>
                <td className="num">{r.tier === "planned" ? "–" : `${Math.round(r.loadFactor * 100)}%`}</td>
                <td className={`num ${r.weeklyProfit < 0 ? "neg" : r.weeklyProfit > 0 ? "pos" : ""}`}>{r.tier === "planned" ? "–" : formatMoney(r.weeklyProfit, { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
