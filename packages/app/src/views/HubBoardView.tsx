import { useMemo, useState } from "react";
import { homeHubOf, typeBlockHours } from "@arg/sim";
import { pct, usd } from "../routes/fmt";
import { bridge, useSim } from "../sim/useSim";
import { boardHubOptions, buildBoardRows, buildHourRows, hubTypeIds, summarizeBoard } from "../hubboard/hubBoard";
import "../hubboard/hubboard.css";

const hours = (h: number) => Math.round(h).toLocaleString("en-US");
const NA = <span className="na" title="No sim report for this route yet">n/a</span>;

/** Read-only hub board: routes touching the hub, block-hour use per type, connecting share. All from existing sim output. */
export default function HubBoardView() {
  const { day, fleet, routes, reports } = useSim();
  const sim = bridge.getSim?.() ?? null;
  const home = sim ? homeHubOf(sim) : bridge.getState().airline.hub;
  const options = useMemo(() => boardHubOptions(fleet, routes, home), [fleet, routes, home]);
  const [picked, setPicked] = useState<string | null>(null);
  const hub = picked && options.includes(picked) ? picked : home;
  const rows = useMemo(() => buildBoardRows(routes, reports, hub), [routes, reports, hub]);
  const summary = useMemo(() => summarizeBoard(routes, reports, hub), [routes, reports, hub]);
  const hourRows = useMemo(
    () => buildHourRows(hubTypeIds(fleet, routes, hub, home), (t) => (sim ? typeBlockHours(sim, t, hub) : { available: 0, used: 0, free: 0 })),
    [fleet, routes, hub, home, day, sim], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <div className="hb">
      <header className="hb-head">
        <h1>Hub board</h1>
        <label className="hb-pick">Hub
          <select value={hub} onChange={(e) => setPicked(e.target.value)} aria-label="Hub">
            {options.map((h) => <option key={h} value={h}>{h}{h === home ? " (home)" : ""}</option>)}
          </select>
        </label>
        <div className="hb-stats" aria-label="Hub summary">
          <span>Routes <b>{summary.routes}</b></span>
          <span>Weekly profit <b className={summary.weeklyProfit < 0 ? "neg" : undefined}>{summary.routes > 0 && summary.unreported < summary.routes ? usd(summary.weeklyProfit) : "n/a"}</b></span>
          <span>Connecting pax / wk <b>{summary.connectingPassengers === null ? "n/a" : Math.round(summary.connectingPassengers).toLocaleString("en-US")}</b>
            {summary.connectingShare !== null && <> ({pct(summary.connectingShare)} of passengers)</>}</span>
        </div>
      </header>
      <div className="hb-grid">
        <section className="hb-box" aria-label="Departures and arrivals">
          <h2>Departures and arrivals</h2>
          {rows.length === 0 ? <p className="hb-empty">No route touches {hub} yet.</p> : (
            <div className="hb-scroll">
              <table className="hb-table">
                <thead>
                  <tr>
                    <th scope="col">Destination</th><th scope="col">Type</th><th scope="col" className="num">Freq / wk</th>
                    <th scope="col" className="num">Load</th><th scope="col" className="num">Connecting</th><th scope="col" className="num">Profit / wk</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.routeId}>
                      <th scope="row"><span className="hb-dir">{r.direction === "dep" ? "DEP" : "ARR"}</span>{r.direction === "dep" ? `${hub}–${r.other}` : `${r.other}–${hub}`}</th>
                      <td>{r.typeId}</td>
                      <td className="num" title={r.frequency < r.requested ? `${r.requested} requested, ${r.frequency} scheduled` : undefined}>
                        {r.frequency}{r.frequency < r.requested ? ` / ${r.requested}` : ""}
                      </td>
                      <td className="num">{r.loadFactor === null ? NA : pct(r.loadFactor)}</td>
                      <td className="num">{r.connectingShare === null ? NA : pct(r.connectingShare)}</td>
                      <td className={`num ${r.weeklyProfit === null ? "" : r.weeklyProfit < 0 ? "neg" : "pos"}`}>{r.weeklyProfit === null ? NA : usd(r.weeklyProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="hb-box" aria-label="Block hours">
          <h2>Block hours per week</h2>
          {hourRows.length === 0 ? <p className="hb-empty">No aircraft based at {hub} and no routes leave it.</p> : (
            <div className="hb-scroll">
              <ul className="hb-hours">
                {hourRows.map((h) => (
                  <li key={h.typeId}>
                    <div className="hb-hours-top">
                      <b>{h.typeId}</b>
                      <span>{hours(h.used)} used / {hours(h.available)} h, <span className={h.free < 0 ? "neg" : undefined}>{hours(h.free)} free</span></span>
                    </div>
                    <div className="hb-bar" role="img" aria-label={`${h.typeId}: ${hours(h.used)} of ${hours(h.available)} block hours used`}>
                      <i className={h.usedShare > 1 ? "over" : undefined} style={{ width: `${Math.min(100, h.usedShare * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="hb-note">Pools count active aircraft based at {hub} and the routes that start there; routes ending at {hub} use the hub of their origin.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
