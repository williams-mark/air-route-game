import { shortTypeLabel } from "../aircraft/names";
import { useMemo, useState } from "react";
import type { Id } from "@arg/contracts";
import { uiAirports } from "../dev/airportSource";
import { fold } from "../routes/airportSearch";
import { AirportField } from "../routes/AirportField";
import { useUi } from "../store";
import { bridge, useSimSelector } from "../sim/useSim";
import { formatDate } from "../sim/format";
import { ARCHETYPE_LABEL, airportPresence, fareBandText, marketsOf, newsAt, routeCompetitors, type AirportRole } from "../rivals/helpers";
import "../rivals/rivals.css";

const MARKET_CAP = 60;
const cityOf = new Map(uiAirports.map((a) => [a.id, fold(a.city)]));
const nameOf = new Map(uiAirports.map((a) => [a.id, a.city]));
const ROLE_LABEL: Record<AirportRole, string> = { hub: "Hub", outstation: "Outstation", flies: "Flies here" };
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
type Tab = "airports" | "routes" | "airlines";

/**
 * Rivals: what other airlines do, as anyone could see it from schedules (no finances). Three views: an airport (who has a hub or an
 * outstation there and where they fly from it), the player's own routes (who competes on each, nonstop or one-stop), and the airlines.
 */
export default function RivalsView() {
  const rivals = useSimSelector((s) => s.rivals);
  const playerRoutes = useSimSelector((s) => s.routes);
  const selected = useUi((s) => s.selectedRival);
  const select = useUi((s) => s.selectRival);
  const setView = useUi((s) => s.setView);
  const showCompetitors = useUi((s) => s.setShowCompetitors);
  const [tab, setTab] = useState<Tab>("airports");
  const sim = bridge.getSim?.() ?? null;
  // The player's own airports: hubs and outstations first, then route ends.
  const mine = useMemo(() => {
    const bases = sim ? [...new Set([...(sim.world.ownedHubs ?? []), ...(sim.outstations ?? []), sim.world.homeHub ?? sim.baseAirport ?? ""])].filter(Boolean) : [];
    const ends = [...new Set(playerRoutes.flatMap((r) => [r.origin, r.destination]))].filter((x) => !bases.includes(x)).sort();
    return { bases: bases.sort(), ends };
  }, [sim, playerRoutes]);
  const [airport, setAirport] = useState<Id>(() => mine.bases[0] ?? mine.ends[0] ?? "LAX");

  if (rivals.list.length === 0) {
    return (
      <div className="page">
        <header className="page-head"><h1>Rivals</h1></header>
        <div className="empty-state"><h2>No competitors yet</h2><p>This scenario has no modelled rival airlines.</p></div>
      </div>
    );
  }
  const active = rivals.list.filter((r) => r.status === "active").length;
  return (
    <div className="page rivals-page">
      <header className="page-head">
        <h1>Rivals</h1>
        <p>{active} airlines flying. What anyone can see from their schedules: where they are based, where they fly, how often, on what, and at about what fare. Their finances are hidden.</p>
      </header>
      <div className="rv-tabs" role="tablist" aria-label="Rivals views">
        {([["airports", "By airport"], ["routes", "Your routes"], ["airlines", "Airlines"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "airports" && <AirportTab airport={airport} setAirport={setAirport} mine={mine} onRival={(id) => { select(id); setTab("airlines"); }} />}
      {tab === "routes" && <RoutesTab onRival={(id) => { select(id); setTab("airlines"); }} />}
      {tab === "airlines" && <AirlinesTab selected={selected} select={select} onAirport={(id) => { setAirport(id); setTab("airports"); }} onMap={() => { showCompetitors(true); setView("map"); }} />}
    </div>
  );
}

function AirportTab({ airport, setAirport, mine, onRival }: { airport: Id; setAirport: (id: Id) => void; mine: { bases: Id[]; ends: Id[] }; onRival: (id: Id) => void }) {
  const rivals = useSimSelector((s) => s.rivals);
  const playerRoutes = useSimSelector((s) => s.routes);
  const [open, setOpen] = useState<Id | null>(null);
  const here = useMemo(() => airportPresence(rivals, airport), [rivals, airport]);
  const yours = playerRoutes.filter((r) => r.origin === airport || r.destination === airport);
  const youFly = new Set(yours.map((r) => (r.origin === airport ? r.destination : r.origin)));
  const news = useMemo(() => newsAt(rivals, new Set([airport]), new Set(here.map((h) => h.rival.id)), 12), [rivals, airport, here]);
  const counts = { hub: here.filter((h) => h.role === "hub").length, outstation: here.filter((h) => h.role === "outstation").length, flies: here.filter((h) => h.role === "flies").length };
  return (
    <section aria-label={`Airlines at ${airport}`}>
      <div className="rv-airport-pick">
        <AirportField label="Airport" value={airport} onChange={(id) => id && setAirport(id)} picking={false} onPickMode={() => undefined} hidePick />
        {(mine.bases.length > 0 || mine.ends.length > 0) && (
          <div className="rv-chips" role="group" aria-label="Your airports">
            {mine.bases.map((id) => <button key={id} className={`rv-chip base${id === airport ? " on" : ""}`} onClick={() => setAirport(id)} title="Your hub or outstation">{id}</button>)}
            {mine.ends.map((id) => <button key={id} className={`rv-chip${id === airport ? " on" : ""}`} onClick={() => setAirport(id)}>{id}</button>)}
          </div>
        )}
      </div>
      <h2 className="rv-h2">{airport}{nameOf.get(airport) ? ` · ${nameOf.get(airport)}` : ""}</h2>
      <p className="hint">
        {here.length === 0 ? "No other airline flies here." : `${counts.hub} airline${counts.hub === 1 ? " has its hub" : "s have their hub"} here, ${counts.outstation} ${counts.outstation === 1 ? "has an outstation" : "have outstations"}, and ${counts.flies} more fly in from their own bases.`}
        {yours.length > 0 && ` You fly ${yours.length} route${yours.length === 1 ? "" : "s"} here.`}
      </p>
      {here.length > 0 && (
        <div className="table-wrap">
          <table className="data rv-presence">
            <thead><tr><th scope="col">Airline</th><th scope="col">Here as</th><th scope="col">Flies from here to</th><th scope="col" className="num">Departures/wk</th><th scope="col" className="num">Seats/wk</th></tr></thead>
            <tbody>
              {here.map((h) => (
                <tr key={h.rival.id}>
                  <th scope="row"><button className="row-link" onClick={() => onRival(h.rival.id)}>{h.rival.name}</button><span className="hint"> {ARCHETYPE_LABEL[h.rival.archetype]}</span></th>
                  <td><span className={`rv-role ${h.role}`}>{ROLE_LABEL[h.role]}</span></td>
                  <td>
                    {h.destinations.length === 0 ? <span className="hint">nothing yet</span> : (
                      <>
                        {(open === h.rival.id ? h.destinations : h.destinations.slice(0, 6)).map((d, i) => (
                          <span key={d.to} className={youFly.has(d.to) ? "rv-dest you" : "rv-dest"} title={`${d.carrier.weeklyFrequency}/wk, ${shortTypeLabel(d.carrier.typeId)}, ${fareBandText(d.carrier.fareBand)}${youFly.has(d.to) ? " (you fly it too)" : ""}`}>
                            {i > 0 && ", "}{d.to} <span className="hint">{d.carrier.weeklyFrequency}/wk</span>
                          </span>
                        ))}
                        {h.destinations.length > 6 && <button className="row-link" onClick={() => setOpen(open === h.rival.id ? null : h.rival.id)}>{open === h.rival.id ? " show fewer" : ` +${h.destinations.length - 6} more`}</button>}
                      </>
                    )}
                  </td>
                  <td className="num">{n0(h.departures)}</td>
                  <td className="num">{n0(h.seats)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">Destinations you also fly are underlined. Hover a destination for frequency, aircraft and estimated fare.</p>
      {news.length > 0 && (
        <div className="panel-box rv-news">
          <h3>Recent moves at {airport}</h3>
          <ul>{news.map((n, i) => <li key={i}><span className="hint">{formatDate(n.day)}</span> {n.text}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function RoutesTab({ onRival }: { onRival: (id: Id) => void }) {
  const rivals = useSimSelector((s) => s.rivals);
  const playerRoutes = useSimSelector((s) => s.routes);
  if (playerRoutes.length === 0) return <p className="hint">You fly no routes yet.</p>;
  const rows = playerRoutes.map((r) => ({ r, c: routeCompetitors(rivals, r.origin, r.destination) }))
    .sort((x, y) => (y.c.nonstop.length + y.c.oneStop.length) - (x.c.nonstop.length + x.c.oneStop.length) || `${x.r.origin}${x.r.destination}`.localeCompare(`${y.r.origin}${y.r.destination}`));
  return (
    <section aria-label="Competition on your routes">
      <p className="hint">Each of your routes and who else sells the same trip: nonstop, or with one change at the other airline's own hub or outstation.</p>
      <div className="table-wrap">
        <table className="data rv-routes">
          <thead><tr><th scope="col">Your route</th><th scope="col" className="num">Your fare</th><th scope="col">Nonstop competitors</th><th scope="col">One-stop competitors</th></tr></thead>
          <tbody>
            {rows.map(({ r, c }) => (
              <tr key={r.id}>
                <th scope="row">{r.origin} {"–"} {r.destination}</th>
                <td className="num">${n0(r.fares.Y)}</td>
                <td>{c.nonstop.length === 0 ? <span className="hint">none</span> : c.nonstop.map((x, i) => (
                  <span key={x.rivalId}>{i > 0 && "; "}<button className="row-link" onClick={() => onRival(x.rivalId)}>{x.name}</button> {x.weeklyFrequency}/wk {shortTypeLabel(x.typeId)} <span className="hint">{fareBandText(x.fareBand)}</span></span>
                ))}</td>
                <td>{c.oneStop.length === 0 ? <span className="hint">none</span> : c.oneStop.map((x, i) => (
                  <span key={`${x.rivalId}-${x.via}`}>{i > 0 && "; "}<button className="row-link" onClick={() => onRival(x.rivalId)}>{x.name}</button> via {x.via} <span className="hint">{x.weeklyFrequency}/wk</span></span>
                ))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AirlinesTab({ selected, select, onAirport, onMap }: { selected: Id | null; select: (id: Id | null) => void; onAirport: (id: Id) => void; onMap: () => void }) {
  const rivals = useSimSelector((s) => s.rivals);
  const playerRoutes = useSimSelector((s) => s.routes);
  const [mq, setMq] = useState("");
  const [allMarkets, setAllMarkets] = useState(false);
  const sel = rivals.list.find((r) => r.id === selected) ?? null;
  const mine = new Set(playerRoutes.map((r) => (r.origin < r.destination ? `${r.origin}-${r.destination}` : `${r.destination}-${r.origin}`)));
  const allOfRival = sel ? marketsOf(rivals, sel.id) : [];
  const q = fold(mq.trim());
  const filtered = q ? allOfRival.filter(({ market: m }) => [m.origin, m.destination].some((c) => fold(c).includes(q) || (cityOf.get(c) ?? "").includes(q))) : allOfRival;
  const markets = allMarkets || q ? filtered : filtered.slice(0, MARKET_CAP);
  const bases = sel ? [sel.hub, ...sel.outstations] : [];
  const grouped = bases.map((b) => ({ base: b, rows: markets.filter(({ market: m }) => m.origin === b || m.destination === b) }));
  return (
    <div className={`rivals-grid ${sel ? "with-detail" : ""}`}>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th scope="col">Airline</th><th scope="col">Type</th><th scope="col">Hub</th><th scope="col">Outstations</th><th scope="col">Fleet</th><th scope="col" className="num">Routes</th><th scope="col" className="num">On order</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rivals.list.map((r) => (
              <tr key={r.id} className={selected === r.id ? "selected" : ""}>
                <th scope="row"><button className="row-link" aria-pressed={selected === r.id} onClick={() => select(selected === r.id ? null : r.id)}>{r.name}</button></th>
                <td>{ARCHETYPE_LABEL[r.archetype]}</td>
                <td><button className="row-link" onClick={() => onAirport(r.hub)}>{r.hub}</button></td>
                <td>{r.outstations.length === 0 ? <span className="hint">none</span> : r.outstations.map((o, i) => <span key={o}>{i > 0 && ", "}<button className="row-link" onClick={() => onAirport(o)}>{o}</button></span>)}</td>
                <td>{r.fleetBand}</td><td className="num">{r.routeCount}</td><td className="num">{r.onOrder > 0 ? r.onOrder : <span className="hint">0</span>}</td>
                <td><span className={r.status === "active" ? "st-active" : "st-stored"}>{r.status === "active" ? "Operating" : "Bankrupt"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <aside className="panel-box rival-detail" aria-label={`${sel.name} details`}>
          <div className="rival-head">
            <div><h2>{sel.name}</h2><p className="hint">{ARCHETYPE_LABEL[sel.archetype]} {"·"} hub {sel.hub}{sel.outstations.length > 0 ? ` · outstations ${sel.outstations.join(", ")}` : ""} {"·"} founded {formatDate(sel.foundedDay)}{sel.onOrder > 0 ? ` · ${sel.onOrder} aircraft on order` : ""}</p></div>
            <button className="icon-btn" aria-label="Close details" onClick={() => select(null)}>{"✕"}</button>
          </div>
          {sel.status === "bankrupt" ? <p className="hint">This airline has failed and no longer flies.</p> : allOfRival.length === 0 ? <p className="hint">No routes yet.</p> : (
            <>
              {allOfRival.length > 12 && <input type="search" className="market-filter" placeholder="Filter markets by code or city" aria-label="Filter markets" value={mq} onChange={(e) => setMq(e.target.value)} />}
              <div className="market-scroll">
                {grouped.filter((g) => g.rows.length > 0).map((g) => (
                  <table key={g.base} className="comp-table">
                    <caption>From {g.base} ({g.base === sel.hub ? "hub" : "outstation"})</caption>
                    <thead><tr><th scope="col">To</th><th scope="col" className="num">Seats/wk</th><th scope="col">Aircraft</th><th scope="col">Fare band</th></tr></thead>
                    <tbody>
                      {g.rows.map(({ market: m, carrier: c }) => {
                        const to = m.origin === g.base ? m.destination : m.origin;
                        return (
                          <tr key={`${m.origin}-${m.destination}`}>
                            <td>{to}{mine.has(m.origin < m.destination ? `${m.origin}-${m.destination}` : `${m.destination}-${m.origin}`) && <span className="comp-flag"> you fly it</span>}</td>
                            <td className="num">{c.weeklySeats.toLocaleString()}</td><td>{shortTypeLabel(c.typeId)}</td><td>{fareBandText(c.fareBand)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
              <p className="hint" role="status">
                Showing {markets.length} of {allOfRival.length} markets.
                {!allMarkets && !q && filtered.length > MARKET_CAP && <> <button className="row-link" onClick={() => setAllMarkets(true)}>Show all</button></>}
              </p>
            </>
          )}
          <div className="side-actions"><button onClick={onMap}>Show competitors on the map</button></div>
        </aside>
      )}
    </div>
  );
}
