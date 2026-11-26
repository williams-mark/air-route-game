import { useMemo, useState } from "react";
import type { Id } from "@arg/contracts";
import {
  baseJetAPriceUsdPerGallon, bidRefusal, guidePriceUsd, isDistressed, MARKET_PARAMS, marketOf, playerValuation, rivalHistory, rivalValuation,
  type RivalAirline, type SimState,
} from "@arg/sim";
import { bridge, useSim } from "../sim/useSim";
import { useToasts } from "../routes/store";
import { formatDate, formatMoney } from "../sim/format";
import { LineChart } from "../markets/LineChart";
import "../markets/markets.css";

const ARCH: Record<string, string> = { legacy: "Full-service", lcc: "Low-cost", regional: "Regional", interisland: "Inter-island" };
const usdM = (v: number) => formatMoney(v);
const gal = (v: number) => `$${v.toFixed(2)}`;

/** Markets: the player's company value, competitors' values and takeover bids both ways, fuel prices. */
export default function MarketsView() {
  useSim();
  const sim = bridge.getSim?.() ?? null;
  const [tab, setTab] = useState<"company" | "competitors" | "fuel">("company");
  if (!sim) return <div className="page"><p>Markets need the full game (not the demo data).</p></div>;
  const m = marketOf(sim);
  return (
    <div className="page markets">
      <header className="page-head">
        <h1>Markets</h1>
        <p>What your airline and your competitors are worth, takeover bids in both directions, and the price of jet fuel.</p>
      </header>
      {m.incoming.length > 0 && <IncomingOffers sim={sim} />}
      <div className="seg mk-tabs" role="tablist" aria-label="Markets sections">
        {([["company", "Your company"], ["competitors", "Competitors and bids"], ["fuel", "Fuel prices"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "company" && <Company sim={sim} />}
      {tab === "competitors" && <Competitors sim={sim} />}
      {tab === "fuel" && <Fuel sim={sim} />}
    </div>
  );
}

function IncomingOffers({ sim }: { sim: SimState }) {
  const push = useToasts((s) => s.push);
  const m = marketOf(sim);
  const v = playerValuation(sim).valueUsd;
  const answer = (id: Id, accept: boolean) => {
    const r = bridge.dispatch({ kind: "respondToBid", bidId: id, accept });
    if (r && !r.ok) push("alert", r.error.message); else push(accept ? "good" : "info", r?.message ?? (accept ? "Offer accepted." : "Offer declined."));
  };
  return (
    <section className="panel-box mk-offer" role="region" aria-label="Takeover offers">
      <h2>Takeover offer</h2>
      {m.incoming.map((b) => (
        <div key={b.id} className="mk-offer-row">
          <p><b>{b.rivalName}</b> offers <b>{usdM(b.priceUsd)}</b> for {sim.airlineName}, {Math.round((b.priceUsd / Math.max(1, v) - 1) * 100)}% above today's value of {usdM(v)}. The offer expires on {formatDate(b.expiresDay)}.</p>
          <ul className="mk-consequences">
            <li><b>Accept:</b> {b.rivalName} merges into your airline. You run the combined company under the {b.rivalName} name, with its aircraft, routes, bases and cash. The price goes to your shareholders (counted in Your company).</li>
            <li><b>Decline:</b> nothing changes now, but {b.rivalName} will compete harder in your markets for a year.</li>
          </ul>
          <div className="mk-actions">
            <button className="primary" onClick={() => answer(b.id, true)}>Accept and merge</button>
            <button onClick={() => answer(b.id, false)}>Decline</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function Company({ sim }: { sim: SimState }) {
  const v = playerValuation(sim);
  const m = marketOf(sim);
  const hist = m.history.map((h) => ({ day: h.day, value: h.valueUsd }));
  const year = m.history.filter((h) => h.day >= sim.world.day - 380)[0];
  const change = year && sim.world.day - year.day >= 330 ? v.valueUsd / Math.max(1, year.valueUsd) - 1 : null;
  const rank = (() => {
    const types = new Map(sim.aircraftTypes.map((t) => [t.id, t]));
    const vals = (sim.rivals?.airlines ?? []).filter((a) => a.status === "active").map((a) => rivalValuation(a, types).valueUsd);
    return { pos: 1 + vals.filter((x) => x > v.valueUsd).length, of: vals.length + 1 };
  })();
  return (
    <>
      <section className="panel-box mk-hero" aria-label="Company value">
        <div>
          <span className="mk-k">Company value</span>
          <span className="mk-big">{usdM(v.valueUsd)}</span>
          <span className="hint">{change === null ? "first year" : `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(0)}% in 12 months`} · number {rank.pos} of {rank.of} airlines by value</span>
        </div>
        <dl className="mini mk-break">
          <dt>Cash</dt><dd className={v.cashUsd < 0 ? "neg" : ""}>{usdM(v.cashUsd)}</dd>
          <dt>Aircraft owned outright (resale)</dt><dd>{usdM(v.fleetUsd)}</dd>
          <dt>Profit, last 12 months</dt><dd className={v.earningsUsd < 0 ? "neg" : "pos"}>{formatMoney(v.earningsUsd, { sign: true })}</dd>
          <dt>Earnings part ({v.earningsUsd >= 0 ? `${MARKET_PARAMS.earningsMultiple}x profit` : `${MARKET_PARAMS.lossMultiple}x loss`})</dt><dd className={v.earningsPartUsd < 0 ? "neg" : ""}>{formatMoney(v.earningsPartUsd, { sign: true })}</dd>
        </dl>
        <p className="hint">Value = cash + aircraft you own outright at resale value + {MARKET_PARAMS.earningsMultiple} times a year's profit ({MARKET_PARAMS.lossMultiple} times a loss), never below {Math.round(MARKET_PARAMS.floorFraction * 100)}% of the hard assets. Leased aircraft add nothing. Competitors are valued the same way.</p>
      </section>
      <section className="panel-box" aria-label="Company value history">
        <h2>Company value, month by month</h2>
        <LineChart points={hist} format={usdM} label="Company value" zeroLine />
      </section>
      {(m.payoutUsd > 0 || m.merged.length > 0) && (
        <section className="panel-box" aria-label="Deals">
          <h2>Deals</h2>
          {m.payoutUsd > 0 && <p>Paid to your shareholders in takeovers: <b>{usdM(m.payoutUsd)}</b>.</p>}
          <ul>{m.merged.map((x, i) => <li key={i}>{formatDate(x.day)}: {x.viaOffer ? `${x.name} bought your airline; you run the combined company.` : `you bought ${x.name}.`}</li>)}</ul>
        </section>
      )}
    </>
  );
}

function Competitors({ sim }: { sim: SimState }) {
  const push = useToasts((s) => s.push);
  const types = useMemo(() => new Map(sim.aircraftTypes.map((t) => [t.id, t])), [sim.aircraftTypes]);
  const m = marketOf(sim);
  const [open, setOpen] = useState<Id | null>(null);
  const [price, setPrice] = useState("");
  const [sort, setSort] = useState<"value" | "name">("value");
  const rows = (sim.rivals?.airlines ?? []).filter((a) => a.status === "active").map((a) => {
    const v = rivalValuation(a, types).valueUsd;
    // Change over the last year: only once there is a sample about a year old (the first months have nothing to compare).
    const past = rivalHistory(m, a.id).filter((h) => h.day >= sim.world.day - 380)[0];
    return { a, v, change: past && sim.world.day - past.day >= 330 ? v / Math.max(1, past.valueUsd) - 1 : null, guide: guidePriceUsd(sim, a) };
  }).sort((x, y) => (sort === "value" ? y.v - x.v : x.a.name.localeCompare(y.a.name)));
  const mine = playerValuation(sim).valueUsd;
  const recent = (sim.rivals?.news ?? []).filter((n) => n.kind === "acquired").slice(-6).reverse();
  const bid = (a: RivalAirline) => {
    const usd = Number(price.replace(/[^0-9.]/g, "")) * 1e6;
    const r = bridge.dispatch({ kind: "bidForAirline", airlineId: a.id, priceUsd: usd });
    if (r && !r.ok) push("alert", r.error.message); else { push("good", r?.message ?? `You bought ${a.name}.`); setOpen(null); }
  };
  return (
    <>
      <section className="panel-box" aria-label="How bids work">
        <h2>Buying a competitor</h2>
        <p className="hint">Offer a price; the airline's board accepts if it is at or above its asking price, usually about {Math.round((MARKET_PARAMS.premium - 1) * 100)}% above its value (close to value when it is in trouble). You pay from cash and can draw on your credit line. You take over its aircraft (owned outright), bases (as hubs), routes and its cash or debts. After a rejection the board waits {MARKET_PARAMS.rejectCooldownDays} days; after a purchase you need {MARKET_PARAMS.acquisitionCooldownDays} days before the next. Values are market estimates: competitors' accounts are not public.</p>
      </section>
      <div className="table-wrap">
        <table className="data mk-table">
          <thead><tr>
            <th scope="col"><button className="th-btn" onClick={() => setSort("name")}>Airline</button></th>
            <th scope="col">Hub</th><th scope="col" className="num">Routes</th><th scope="col" className="num">Aircraft</th>
            <th scope="col" className="num"><button className="th-btn" onClick={() => setSort("value")}>Value (est.)</button></th>
            <th scope="col" className="num">12 months</th><th scope="col" className="num">Guide price</th><th scope="col"><span className="sr-only">Offer</span></th>
          </tr></thead>
          <tbody>
            {rows.map(({ a, v, change, guide }) => {
              const refusal = bidRefusal(sim, a, guide);
              const last = [...m.bids].reverse().find((b) => b.rivalId === a.id);
              return (
                <tr key={a.id}>
                  <th scope="row">{a.name}<span className="hint"> {ARCH[a.archetype]}{isDistressed(a) ? " · in trouble" : ""}{(m.hostileUntil[a.id] ?? -1) > sim.world.day ? " · hostile to you" : ""}</span>
                    {last && <span className="hint mk-last"> Last offer {formatDate(last.day)}: {usdM(last.priceUsd)}, {last.outcome}{last.hintUsd ? ` (asked about ${usdM(last.hintUsd)})` : ""}</span>}
                  </th>
                  <td>{a.bases[0]}</td>
                  <td className="num">{a.routes.length}</td>
                  <td className="num">{a.fleet.length}</td>
                  <td className="num">{usdM(v)}{v > mine ? "" : <span className="hint"> smaller than you</span>}</td>
                  <td className={`num ${change === null ? "" : change >= 0 ? "pos" : "neg"}`}>{change === null ? "–" : `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(0)}%`}</td>
                  <td className="num">{usdM(guide)}</td>
                  <td>
                    {open === a.id ? (
                      <form className="mk-bid" onSubmit={(e) => { e.preventDefault(); bid(a); }}>
                        <label>$<input autoFocus inputMode="decimal" aria-label={`Offer for ${a.name}, millions of dollars`} value={price} onChange={(e) => setPrice(e.target.value)} />M</label>
                        <button className="primary" type="submit">Offer</button>
                        <button type="button" onClick={() => setOpen(null)}>Cancel</button>
                      </form>
                    ) : (
                      <button disabled={!!refusal && !/credit line/.test(refusal) ? true : false} title={refusal ?? undefined} onClick={() => { setOpen(a.id); setPrice(String(Math.round(guide / 1e6))); }}>Make offer</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {recent.length > 0 && (
        <section className="panel-box" aria-label="Recent deals">
          <h2>Recent deals in the industry</h2>
          <ul>{recent.map((n, i) => <li key={i}><span className="hint">{formatDate(n.day)}</span> {n.text}</li>)}</ul>
        </section>
      )}
    </>
  );
}

function Fuel({ sim }: { sim: SimState }) {
  const today = sim.world.day;
  const start = Math.max(sim.rivals?.originDay ?? today, today - 3650);
  const pts = useMemo(() => {
    const out: { day: number; value: number }[] = [];
    for (let d = Math.min(start, today - 365); d <= today; d += 14) out.push({ day: d, value: baseJetAPriceUsdPerGallon(d) });
    out.push({ day: today, value: baseJetAPriceUsdPerGallon(today) });
    return out;
  }, [start, today]);
  const now = baseJetAPriceUsdPerGallon(today), ago = baseJetAPriceUsdPerGallon(today - 365);
  let fuel = 0, costs = 0;
  for (const r of sim.world.routes) {
    const ev = sim.routeReports[r.id]?.evaluation;
    if (!ev) continue;
    fuel += ev.lines.find((l) => l.key === "fuel")?.weekly ?? 0;
    costs += ev.costs;
  }
  const per10c = now > 0 ? (fuel * 0.1) / now : 0;
  return (
    <>
      <section className="panel-box mk-hero" aria-label="Fuel price">
        <div>
          <span className="mk-k">Jet fuel, US West Coast</span>
          <span className="mk-big">{gal(now)}<small>/gal</small></span>
          <span className={`hint ${now > ago ? "neg" : "pos"}`}>{now >= ago ? "+" : "−"}{gal(Math.abs(now - ago))} on a year ago ({gal(ago)})</span>
        </div>
        <dl className="mini mk-break">
          <dt>Your fuel bill</dt><dd>{formatMoney(fuel)} a week</dd>
          <dt>Share of route costs</dt><dd>{costs > 0 ? `${Math.round((fuel / costs) * 100)}%` : "–"}</dd>
          <dt>Each 10 cents a gallon</dt><dd>{formatMoney(per10c)} a week</dd>
        </dl>
        <p className="hint">Prices are the game's fuel series: annual averages from US Gulf Coast jet fuel (EIA) for 2015-2025 plus a West Coast delivery premium, published US airline fuel costs for 2026, and an assumed path after that. Other regions pay their own local premium. Before 2015 the series holds at its 2015 level.</p>
      </section>
      <section className="panel-box" aria-label="Fuel price history">
        <h2>Jet fuel price, USD per US gallon</h2>
        <LineChart points={pts} format={(v) => gal(v)} label="Jet fuel price" />
      </section>
    </>
  );
}
