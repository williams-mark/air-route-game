import { useEffect, useMemo, useRef, useState } from "react";
import type { CabinClass, Fares, Route } from "@arg/contracts";
import { airportById } from "@arg/data";
import { dayToDate } from "@arg/sim";
import { useUi } from "../store";
import { bridge, useSim } from "../sim/useSim";
import { AirportField } from "./AirportField";
import { FrequencyBars } from "./charts";
import { FareFields, FrequencyField, Stat, useDebounced } from "./editor";
import {
  bestFrequency, bestType, eligibleTypes, faresToText, frequencySweep, marketFares, marketInfo, parseFares, projectRoute, rivalPresence, routeName,
  validateRouteDraft, type RouteDraft,
} from "./helpers";
import { pct, usd, usdSigned } from "./fmt";
import { useCreation, useToasts } from "./store";

const SEG_LABEL = { business: "Business", leisure: "Leisure", vfr: "Visiting family", budget: "Budget" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function RouteCreator() {
  const c = useCreation();
  const speed = useSim().speed;
  // Sandbox rule: the game stays paused while the creator is open.
  useEffect(() => { if (speed !== 0) bridge.setSpeed(0); }, [speed]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);
  const origin = c.origin ? airportById.get(c.origin) : undefined;
  const destination = c.destination ? airportById.get(c.destination) : undefined;
  return (
    <>
      <div className="sandbox-banner" role="status">
        <b>Paused sandbox</b> {"—"} nothing is committed until you press Open route
      </div>
      <header className="rp-head">
        <div>
          <h2 id="rp-title" tabIndex={-1} ref={titleRef}>New route</h2>
          <p>Choose two airports on the map or type their codes.</p>
        </div>
        <button className="icon-btn" aria-label="Cancel new route" title="Cancel (Esc)" onClick={() => c.end()}>{"✕"}</button>
      </header>
      <div className="rp-scroll">
        <div className="rp-pair">
          <AirportField label="From" value={c.origin} onChange={(id) => (id ? c.assign(id, "origin") : c.clear("origin"))} exclude={c.destination ? [c.destination] : []}
            picking={c.pick === "origin"} onPickMode={() => c.setPick("origin")} autoFocus={!c.origin} />
          <button type="button" className="icon-btn rp-swap" aria-label="Swap origin and destination" title="Swap" disabled={!c.origin && !c.destination} onClick={c.swap}>{"⇅"}</button>
          <AirportField label="To" value={c.destination} onChange={(id) => (id ? c.assign(id, "destination") : c.clear("destination"))} exclude={c.origin ? [c.origin] : []}
            picking={c.pick === "destination"} onPickMode={() => c.setPick("destination")} />
        </div>
        {origin && destination ? (
          <PairSandbox key={`${origin.id}-${destination.id}`} originId={origin.id} destinationId={destination.id} />
        ) : (
          <p className="rp-empty">Pick both ends to see the market, the aircraft that can fly it and a profit projection.</p>
        )}
      </div>
    </>
  );
}

function PairSandbox({ originId, destinationId }: { originId: string; destinationId: string }) {
  const { day, routes } = useSim();
  const push = useToasts((s) => s.push);
  const end = useCreation((s) => s.end);
  const selectUi = useUi((s) => s.select);
  const a = airportById.get(originId)!, b = airportById.get(destinationId)!;
  const wkDay = Math.floor(day / 7) * 7;
  const year = dayToDate(wkDay);
  const market = useMemo(() => marketInfo(a, b), [a, b]);
  const rival = useMemo(() => rivalPresence(a, b), [a, b]);
  const types = useMemo(() => eligibleTypes(a, b, year.year), [a, b, year.year]);
  const existing = routes.find((r) => (r.origin === originId && r.destination === destinationId) || (r.origin === destinationId && r.destination === originId));
  const mf = useMemo(() => marketFares(market.distanceKm), [market.distanceKm]);

  const [typeId, setTypeId] = useState(() => bestType(a, b, wkDay)?.id ?? types.find((t) => t.available)?.type.id ?? types[0]?.type.id ?? "");
  const [fareText, setFareText] = useState<Record<CabinClass, string>>(() => faresToText({ Y: mf.Y }));
  const [freq, setFreq] = useState<number>(() => {
    const t = bestType(a, b, wkDay)?.id;
    if (!t) return 7;
    return bestFrequency(frequencySweep({ origin: originId, destination: destinationId, weeklyFrequency: 7, fares: { Y: mf.Y }, typeId: t }, wkDay))?.frequency ?? 7;
  });
  const parsed = parseFares(fareText);
  const fares: Fares = parsed ?? { Y: mf.Y };
  const draft: RouteDraft = useMemo(
    () => ({ origin: originId, destination: destinationId, weeklyFrequency: freq, fares, typeId }),
    [originId, destinationId, freq, typeId, fares.Y, fares.W, fares.J, fares.F], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dDraft = useDebounced(draft, 220);
  const settling = dDraft !== draft;
  const week = useMemo(() => (typeId ? projectRoute({ ...dDraft, id: "draft" }, wkDay) : null), [dDraft, wkDay, typeId]);
  const ev = week?.evaluation;
  const sweep = useMemo(() => (typeId ? frequencySweep(dDraft, wkDay) : []), [dDraft.origin, dDraft.destination, dDraft.typeId, dDraft.fares, wkDay, typeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = useMemo(() => bestFrequency(sweep), [sweep]);
  const issue = typeId ? validateRouteDraft(draft, routes) : { code: "no_type", message: "No aircraft type in the database can fly this pair." };

  const open = () => {
    if (!parsed) { push("alert", "Economy fare is required; other cabins must be positive numbers or blank."); return; }
    const res = bridge.dispatch({ kind: "openRoute", route: draft });
    if (res && !res.ok) { push("alert", res.error.message); return; }
    const r: Route | undefined = bridge.getState().routes.find((x) => x.origin === originId && x.destination === destinationId);
    push("good", `Opened ${routeName(draft)}: ${freq}/wk with ${typeId}.`);
    end();
    if (r) selectUi({ kind: "route", id: res && res.ok && res.routeId ? res.routeId : r.id });
  };

  const mix = (Object.keys(market.shares) as Array<keyof typeof market.shares>);
  return (
    <>
      <section className="rp-sec" aria-labelledby="rp-market">
        <h3 id="rp-market">Market</h3>
        <div className="rp-stats">
          <Stat label="Distance" value={`${Math.round(market.distanceKm).toLocaleString()} km`} />
          <Stat label="Market size" value={`${Math.round(market.weeklyOneWay).toLocaleString()} / wk`} sub="one-way, annual average" />
        </div>
        <div className="seg-bar" role="img" aria-label={`Segment mix: ${mix.map((m) => `${SEG_LABEL[m]} ${pct(market.shares[m])}`).join(", ")}`}>
          {mix.map((m) => <span key={m} className={`seg-${m}`} style={{ flexGrow: market.shares[m] }} />)}
        </div>
        <ul className="seg-legend">{mix.map((m) => <li key={m}><i className={`seg-${m}`} />{SEG_LABEL[m]} {pct(market.shares[m])}</li>)}</ul>
        <p className="rp-note">
          <b>Competition:</b> a rival flies this pair {rival.directFrequency}/wk with about {rival.directSeats} seats at about {usd(rival.fare)}
          {rival.oneStop ? `, and one-stop connections undercut at about ${usd(rival.oneStopFare ?? 0)}` : ", with no competitive one-stop option"}.
        </p>
        {existing && <p className="rp-err" role="alert">You already fly {routeName(existing)}. Opening this would be refused.</p>}
      </section>

      <section className="rp-sec" aria-labelledby="rp-plan">
        <h3 id="rp-plan">Plan</h3>
        {types.length === 0 ? (
          <p className="rp-err" role="alert">No aircraft in the database can fly this pair (range, runway or overwater limit).</p>
        ) : (
          <div className="rp-field">
            <label htmlFor="rp-type">Aircraft type</label>
            <select id="rp-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map(({ type, available }) => (
                <option key={type.id} value={type.id} disabled={!available}>
                  {type.id} {"·"} {Math.floor(type.maxSeats * (type.widebody ? 0.7 : 0.9))} seats {"·"} {type.rangeKm.toLocaleString()} km{available ? "" : ` (not built in ${year.year})`}
                </option>
              ))}
            </select>
            <div className="af-sub">{types.length} type{types.length === 1 ? "" : "s"} can fly this pair.</div>
          </div>
        )}
        <FrequencyField value={freq} onChange={setFreq} />
        <FareFields text={fareText} onChange={setFareText} km={market.distanceKm} />
      </section>

      <section className="rp-sec" aria-labelledby="rp-proj">
        <h3 id="rp-proj">Projection <span className="hint">({MONTHS[year.month]} {year.year} demand)</span></h3>
        <div className="rp-proj" aria-live="polite" aria-busy={settling}>
          <div><span className="k">{settling ? "Updating…" : "Profit / week"}</span><span className={`big ${!ev ? "" : ev.profit >= 0 ? "pos" : "neg"}`}>{ev ? usdSigned(ev.profit) : "–"}</span></div>
          <div><span className="k">Load factor</span><span className="big">{ev ? pct(ev.loadFactor) : "–"}</span></div>
          <div><span className="k">Market share</span><span className="big">{week ? pct(week.snapshot.playerShare) : "–"}</span></div>
        </div>
        {ev && !ev.feasible && <p className="rp-err" role="alert">{ev.infeasibleReasons.join("; ")}</p>}
        <h4 className="rp-h4">Profit vs frequency</h4>
        {sweep.length > 0 && <FrequencyBars points={sweep} bestFreq={best?.frequency ?? null} current={freq} onPick={setFreq} />}
        <div className="rp-actions">
          <button type="button" disabled={!best || best.frequency === freq} onClick={() => best && setFreq(best.frequency)}>
            {best ? `Use best: ${best.frequency}/wk (${usdSigned(best.profit)})` : "No feasible frequency"}
          </button>
        </div>
      </section>

      {issue && issue.code !== "duplicate_route" && <p className="rp-err" role="alert">{issue.message}</p>}
      <div className="rp-sticky">
        <button type="button" onClick={() => end()}>Cancel</button>
        <button type="button" className="primary" disabled={!typeId || !parsed} onClick={open}>Open route</button>
      </div>
    </>
  );
}
