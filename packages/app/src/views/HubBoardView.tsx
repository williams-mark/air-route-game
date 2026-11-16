import { useMemo, useState } from "react";
import { shortTypeLabel } from "../aircraft/names";
import { CLASS_NAME, homeHubOf, playerHubs, typeBlockHours } from "@arg/sim";
import { pct, usd } from "../routes/fmt";
import { bridge, useSim } from "../sim/useSim";
import { boardHubOptions, buildBoardRows, buildConnectingAnalysis, buildHourRows, hubTypeIds, summarizeBoard } from "../hubboard/hubBoard";
import { hubOptions } from "../fleet/typeTable";
import "../hubboard/hubboard.css";

const hours = (h: number) => Math.round(h).toLocaleString("en-US");
const num = (v: number) => (v > 0 && v < 1 ? "<1" : Math.round(v).toLocaleString("en-US"));
const NA = <span className="na" title="No sim report for this route yet">n/a</span>;

/** Read-only hub board: routes touching the hub, block-hour use per type, connecting share. All from existing sim output. */
export default function HubBoardView() {
  const { day, fleet, routes, reports } = useSim();
  const sim = bridge.getSim?.() ?? null;
  const home = sim ? homeHubOf(sim) : bridge.getState().airline.hub;
  const options = useMemo(() => boardHubOptions(sim ? playerHubs(sim) : hubOptions(fleet, home), home), [fleet, home, sim]);
  const [picked, setPicked] = useState<string | null>(null);
  const hub = picked && options.includes(picked) ? picked : home;
  const rows = useMemo(() => buildBoardRows(routes, reports, hub), [routes, reports, hub]);
  const summary = useMemo(() => summarizeBoard(routes, reports, hub), [routes, reports, hub]);
  const conn = useMemo(() => buildConnectingAnalysis(routes, reports, hub), [routes, reports, hub]);
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
          <span>Connecting pax / wk <b>{conn.transferPassengers === null ? "n/a" : num(conn.transferPassengers)}</b>
            {conn.transferShare !== null && <> ({pct(conn.transferShare, 1)} of passengers)</>}</span>
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
                    <th scope="col" className="num">Load</th><th scope="col">By cabin</th><th scope="col" className="num">Connecting / wk</th><th scope="col" className="num">Profit / wk</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.routeId}>
                      <th scope="row"><span className="hb-dir">{r.direction === "dep" ? "DEP" : "ARR"}</span>{r.direction === "dep" ? `${hub}–${r.other}` : `${r.other}–${hub}`}</th>
                      <td>{shortTypeLabel(r.typeId)}</td>
                      <td className="num" title={r.frequency < r.requested ? `${r.requested} requested, ${r.frequency} scheduled` : undefined}>
                        {r.frequency}{r.frequency < r.requested ? ` / ${r.requested}` : ""}
                      </td>
                      <td className="num">{r.loadFactor === null ? NA : pct(r.loadFactor)}</td>
                      <td className="hb-cabins">{r.byCabin.length === 0 ? NA : r.byCabin.map((c) => (
                        <span key={c.cls} title={`${CLASS_NAME[c.cls]}: ${Math.round(c.passengersPerWeek)} of ${Math.round(c.seatsPerWeek)} seats a week`}>{c.cls} {pct(c.loadFactor ?? 0)}</span>
                      ))}</td>
                      <td className="num">{r.connectingShare === null || r.connectingPassengers === null ? NA : `${num(r.connectingPassengers)} (${pct(r.connectingShare, 1)})`}</td>
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
                      <b>{shortTypeLabel(h.typeId)}</b>
                      <span>{hours(h.used)} used / {hours(h.available)} h, <span className={h.free < 0 ? "neg" : undefined}>{hours(h.free)} free</span></span>
                    </div>
                    <div className="hb-bar" role="img" aria-label={`${shortTypeLabel(h.typeId)}: ${hours(h.used)} of ${hours(h.available)} block hours used`}>
                      <i className={h.usedShare > 1 ? "over" : undefined} style={{ width: `${Math.min(100, h.usedShare * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="hb-note">Pools count active aircraft based at {hub} and the routes that start there; routes ending at {hub} use the hub of their origin.</p>
            </div>
          )}
        </section>
        <section className="hb-box hb-conn" aria-label="Connecting passengers">
          <h2>Connecting passengers at {hub}</h2>
          {conn.transferPassengers === null ? <p className="hb-empty">Shown after the next daily report.</p> : (
            <div className="hb-scroll">
              <div className="hb-conn-stats">
                <span>Changing planes here <b>{num(conn.transferPassengers)}</b> / wk</span>
                <span>Starting or ending here <b>{num(conn.localPassengers)}</b> / wk</span>
                <span>Share connecting <b>{conn.transferShare === null ? "n/a" : pct(conn.transferShare, 1)}</b> of passengers</span>
                <span>Seats they fill <b>{conn.shareOfBoardings === null ? "n/a" : pct(conn.shareOfBoardings, 1)}</b> of seats sold</span>
                <span>Through revenue <b>{usd(conn.revenue)}</b> / wk</span>
              </div>
              {conn.transferShare !== null && (
                <div className="hb-bar hb-conn-bar" role="img" aria-label={`${pct(conn.transferShare, 1)} of passengers at ${hub} are connecting`}>
                  <i style={{ width: `${Math.min(100, conn.transferShare * 100)}%` }} />
                </div>
              )}
              {conn.markets.length === 0 ? <p className="hb-empty">Nobody changes planes at {hub} yet. Passengers connect when two of your routes meet here and you do not already fly nonstop between their far ends.</p> : (
                <table className="hb-table">
                  <thead>
                    <tr>
                      <th scope="col">Through market</th><th scope="col" className="num">Pax / wk</th><th scope="col" className="num">Of connections</th>
                      <th scope="col" className="num">Your market share</th><th scope="col" className="num">Through fare</th><th scope="col" className="num">Revenue / wk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conn.markets.map((m) => (
                      <tr key={m.key}>
                        <th scope="row">{m.origin}–{m.destination} <span className="na">via {hub}</span></th>
                        <td className="num">{num(m.passengers)}</td>
                        <td className="num">{pct(m.shareOfTransfers, 1)}</td>
                        <td className="num">{pct(m.marketShare, 1)}</td>
                        <td className="num">{usd(m.throughFare)}</td>
                        <td className="num">{usd(m.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="hb-note">Passengers are counted both directions. Someone changing planes rides two of the hub's routes but is counted once here; the Connecting column above counts them on each route they ride.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
