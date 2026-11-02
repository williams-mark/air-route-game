import { aircraftTypes } from "@arg/data";
import { useUi } from "../store";
import { useSimSelector } from "../sim/useSim";
import { formatDate } from "../sim/format";
import { ARCHETYPE_LABEL, fareBandText, marketsOf } from "../rivals/helpers";
import "../rivals/rivals.css";

export default function RivalsView() {
  const rivals = useSimSelector((s) => s.rivals);
  const playerRoutes = useSimSelector((s) => s.routes);
  const selected = useUi((s) => s.selectedRival);
  const select = useUi((s) => s.selectRival);
  const setView = useUi((s) => s.setView);
  const showCompetitors = useUi((s) => s.setShowCompetitors);
  const sel = rivals.list.find((r) => r.id === selected) ?? null;
  const mine = new Set(playerRoutes.map((r) => (r.origin < r.destination ? `${r.origin}-${r.destination}` : `${r.destination}-${r.origin}`)));
  const typeName = (id: string) => aircraftTypes.find((t) => t.id === id)?.name ?? id;
  const markets = sel ? marketsOf(rivals, sel.id) : [];

  return (
    <div className="page">
      <header className="page-head"><h1>Rivals</h1><p>What you can see from the outside: schedules, aircraft and estimated fares. Their finances and plans are hidden.</p></header>
      {rivals.list.length === 0 ? (
        <div className="empty-state"><h2>No competitors yet</h2><p>This scenario has no modelled rival airlines.</p></div>
      ) : (
        <div className={`rivals-grid ${sel ? "with-detail" : ""}`}>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Airline</th><th scope="col">Type</th><th scope="col">Hub</th><th scope="col">Fleet</th><th scope="col" className="num">Routes</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {rivals.list.map((r) => (
                  <tr key={r.id} className={selected === r.id ? "selected" : ""}>
                    <th scope="row"><button className="row-link" aria-pressed={selected === r.id} onClick={() => select(selected === r.id ? null : r.id)}>{r.name}</button></th>
                    <td>{ARCHETYPE_LABEL[r.archetype]}</td><td>{r.hub}</td><td>{r.fleetBand}</td><td className="num">{r.routeCount}</td>
                    <td><span className={r.status === "active" ? "st-active" : "st-stored"}>{r.status === "active" ? "Operating" : "Bankrupt"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sel && (
            <aside className="panel-box rival-detail" aria-label={`${sel.name} details`}>
              <div className="rival-head">
                <div><h2>{sel.name}</h2><p className="hint">{ARCHETYPE_LABEL[sel.archetype]} {"·"} hub {sel.hub} {"·"} founded {formatDate(sel.foundedDay)}</p></div>
                <button className="icon-btn" aria-label="Close details" onClick={() => select(null)}>{"✕"}</button>
              </div>
              {sel.status === "bankrupt" ? (
                <p className="hint">This airline has failed and no longer flies.</p>
              ) : markets.length === 0 ? (
                <p className="hint">No routes are visible.</p>
              ) : (
                <table className="comp-table">
                  <thead><tr><th scope="col">Market</th><th scope="col" className="num">Seats/wk</th><th scope="col">Aircraft</th><th scope="col">Fare band</th></tr></thead>
                  <tbody>
                    {markets.map(({ market: m, carrier: c }) => (
                      <tr key={`${m.origin}-${m.destination}`}>
                        <td>{m.origin} {"–"} {m.destination}{mine.has(m.origin < m.destination ? `${m.origin}-${m.destination}` : `${m.destination}-${m.origin}`) && <span className="comp-flag"> you fly it</span>}</td>
                        <td className="num">{c.weeklySeats.toLocaleString()}</td><td>{typeName(c.typeId)}</td><td>{fareBandText(c.fareBand)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="side-actions">
                <button onClick={() => { showCompetitors(true); setView("map"); }}>Show competitors on the map</button>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
