import { shortTypeLabel } from "../aircraft/names";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Airport, CabinClass, Fares, Route } from "@arg/contracts";
import { aircraftTypes, airportById } from "@arg/data";
import { AircraftPicker } from "../aircraft/AircraftPicker";
import { rangeNote, routeBlock, usableRangeKm } from "../aircraft/availability";
import { usePickerMemory } from "../aircraft/memory";
import { dayToDate, routeHourSummary } from "@arg/sim";
import { ownedOrOrderedTypeIds } from "../fleet/typeTable";
import { useUi } from "../store";
import { bridge, useSim } from "../sim/useSim";
import { AirportField } from "./AirportField";
import { FrequencyBars } from "./charts";
import { FareFields, FrequencyField, Stat, useDebounced } from "./editor";
import {
  bestFrequency, bestType, eligibleTypes, faresToText, frequencySweep, marketFares, marketInfo, parseFares, projectRoute, rivalPresence, routeName,
  operatingMix, parseTargetLf, previewNewRoute, substitutionText, TARGET_LF_MESSAGE, validateRouteDraft, type RouteDraft,
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
      <div className="sandbox-banner" role="status"><b>Paused sandbox.</b> Nothing is committed until Open route.</div>
      <header className="rp-head">
        <div>
          <h2 id="rp-title" tabIndex={-1} ref={titleRef}>New route</h2>
          <p>Pick two airports on the map or type codes.</p>
        </div>
        <button type="button" className="sandbox-close" aria-label="Close sandbox and resume the clock" title="Close the sandbox (Esc) and restore the game speed" onClick={() => c.end()}>Close sandbox</button>
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
          <p className="rp-empty">Pick both ends to see the market and a projection.</p>
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
  const mf = useMemo(() => marketFares(market.distanceKm, a, b), [market.distanceKm, a, b]);

  const ownedBest = (x: Airport, y: Airport, d: number) => {
    const owned = new Set((bridge.getSim?.()?.world.fleet ?? []).filter((ac) => ac.status === "active").map((ac) => ac.typeId));
    return owned.size > 0 ? bestType(x, y, d, 7, undefined, (t) => owned.has(t.id)) : null;
  };
  // Only types the airline owns or has on order can be picked; the rest are hidden, not offered.
  const fleetNow = useSim().fleet;
  const ownedIds = useMemo(() => ownedOrOrderedTypeIds(fleetNow), [fleetNow]);
  const ownedTypes = useMemo(() => aircraftTypes.filter((t) => ownedIds.has(t.id)), [ownedIds]);
  const [typeId, setTypeId] = useState(() => {
    const last = usePickerMemory.getState().last.route;
    const lastOk = last && ownedIds.has(last) ? types.find((o) => o.type.id === last && o.available) : undefined;
    // Default to the most profitable type the airline already owns that can fly the pair, else the first owned type that can.
    return lastOk?.type.id ?? ownedBest(a, b, wkDay)?.id ?? types.find((t) => t.available && ownedIds.has(t.type.id))?.type.id ?? "";
  });
  const [fareText, setFareText] = useState<Record<CabinClass, string>>(() => faresToText({ Y: mf.Y }));
  const [freq, setFreq] = useState<number>(() => {
    const t = typeId;
    if (!t) return 7;
    // With a live sim, size it against the real network, fleet and rivals; the standalone sweep (own notional fleet, no rival schedules) can
    // find every frequency loss-making and fall back to 1 a week, which is a pointless default.
    const live = bridge.getSim?.() ?? null;
    if (live && t) {
      const fares0: Fares = { Y: mf.Y };
      // Block hours at the origin hub cap the frequency the hub can fly; never default above it.
      const perWk = routeHourSummary(live, originId, destinationId, t, 1).needed;
      const fitFreq = perWk > 0 ? Math.floor(routeHourSummary(live, originId, destinationId, t, 1).free / perWk) : 0;
      let best: { f: number; profit: number; full: boolean } | null = null;
      for (const f of [3, 5, 7, 10, 14, 21, 28, 35]) {
        if (f > fitFreq) continue;
        const pv = previewNewRoute(live, { origin: originId, destination: destinationId, weeklyFrequency: f, fares: fares0, typeId: t });
        if (!pv || !pv.figures.feasible || pv.operatedFraction <= 0) continue;
        const full = pv.operatedFraction >= 0.97;
        // Network effect counts: a frequency that takes aircraft off the airline's other routes is not a good default.
        const net = pv.figures.profit + pv.otherRoutesDelta;
        if (!best || (full && !best.full) || (full === best.full && net > best.profit)) best = { f, profit: net, full };
      }
      if (best && best.profit > 0) return best.f;
      return Math.max(1, Math.min(fitFreq, best?.f ?? fitFreq));
    }
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
  // With a live sim the headline figures use the player's own fleet (substitutes included), rivals and hub network; otherwise the standalone model.
  const sim = bridge.getSim?.() ?? null;
  const livePrevAll = useMemo(() => (sim && typeId ? previewNewRoute(sim, dDraft) : null), [dDraft, typeId, sim?.world.day]); // eslint-disable-line react-hooks/exhaustive-deps
  // No aircraft could fly it today: keep the standalone "planned, not yet operating" projection (what it would earn once you have the aircraft) instead of an idle-route loss.
  const planned = !!livePrevAll && !livePrevAll.ownershipIncluded && livePrevAll.operatedFraction === 0;
  const livePrev = planned ? null : livePrevAll;
  const ev = livePrev ? { ...(week?.evaluation ?? livePrev.figures), ...livePrev.figures } : week?.evaluation;
  const operating = livePrev ? operatingMix(livePrev.scheduling, sim!.world.fleet) : [];
  const substituted = substitutionText(typeId, operating, shortTypeLabel);
  const sweep = useMemo(() => (typeId ? frequencySweep(dDraft, wkDay) : []), [dDraft.origin, dDraft.destination, dDraft.typeId, dDraft.fares, wkDay, typeId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The suggestion must be something the origin hub can actually fly: the open command refuses more block hours than are free there.
  const perFlight = sim && typeId ? routeHourSummary(sim, originId, destinationId, typeId, 1) : null;
  const maxFit = perFlight && perFlight.needed > 0 ? Math.max(0, Math.floor((perFlight.free + 1e-9) / perFlight.needed)) : Infinity;
  const best = useMemo(() => bestFrequency(sweep.filter((p) => p.frequency <= maxFit)), [sweep, maxFit]);
  // "Use best" is priced on the same live model as the headline, so the two always compare like with like. The chart below stays the
  // standalone model (its shape is useful, its absolute numbers are not), and the suggestion is dropped when the live model says it is no better.
  const liveBest = useMemo(
    () => (sim && typeId && best && !planned && best.frequency !== dDraft.weeklyFrequency ? previewNewRoute(sim, { ...dDraft, weeklyFrequency: best.frequency }) : null),
    [best?.frequency, dDraft, typeId, planned, sim?.world.day], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const useBest = best && (planned || !livePrev) ? { frequency: best.frequency, profit: best.profit }
    : best && liveBest && livePrev && liveBest.figures.feasible && liveBest.figures.profit > livePrev.figures.profit ? { frequency: best.frequency, profit: liveBest.figures.profit }
    : null;
  const selectedType = aircraftTypes.find((t) => t.id === typeId);
  const issue = typeId ? validateRouteDraft(draft, routes, undefined, undefined, wkDay) : { code: "no_type", message: "No owned type can fly this pair." };
  // Block-hour pool of the origin hub for the chosen type and frequency (live figures).
  const hours = sim && typeId ? routeHourSummary(sim, originId, destinationId, typeId, freq) : null;
  const hoursShort = !!hours && hours.needed > hours.free + 1e-9;
  const [lfText, setLfText] = useState("");
  const lf = parseTargetLf(lfText);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => { setOpenError(null); }, [freq, typeId]);

  const open = () => {
    if (!parsed) { push("alert", "Economy fare required; other cabins positive or blank."); return; }
    if (!lf.ok) { push("alert", TARGET_LF_MESSAGE); return; }
    const routeDraft: RouteDraft = { ...draft, targetLoadFactor: lf.value ?? undefined };
    const res = bridge.dispatch({ kind: "openRoute", route: routeDraft });
    if (res && !res.ok) { setOpenError(res.error.message); push("alert", res.error.message); return; }
    const r: Route | undefined = bridge.getState().routes.find((x) => x.origin === originId && x.destination === destinationId);
    push("good", `Opened ${routeName(draft)}: ${freq}/wk, ${typeId}.`);
    if (res && res.ok && res.warnings && res.warnings.length > 0) push("alert", res.warnings.join(" "));
    end();
    if (r) selectUi({ kind: "route", id: res && res.ok && res.routeId ? res.routeId : r.id });
  };

  const existingMsg = existing ? `Already flown: ${routeName(existing)}.` : null;
  const issueMsg = issue && issue.code !== "duplicate_route" ? issue.message : null;
  const fareMsg = parsed ? null : "Economy fare required.";
  const lfMsg = lf.ok ? null : TARGET_LF_MESSAGE;
  // The same rules the open command applies: a button that is certain to be refused is disabled and says why.
  const blockedReason = existing ? "This pair is already flown; update that route instead."
    : issue ? issue.message
    : hoursShort ? `Not enough block hours free at ${originId}: fewer flights or another aircraft.`
    : null;
  const footMsgs = [existingMsg, issueMsg, fareMsg, lfMsg, openError].filter((m): m is string => !!m);
  const mix = (Object.keys(market.shares) as Array<keyof typeof market.shares>);
  return (
    <>
      <div className="rc-body">
        <section className="rc-sec rc-plan" aria-labelledby="rp-plan">
          <h3 id="rp-plan">Plan</h3>
          {ownedTypes.length === 0 ? (
            <p className="rp-err" role="alert">No aircraft owned or on order. Order a type first.</p>
          ) : types.length === 0 ? (
            <p className="rp-err" role="alert">No aircraft can fly this pair (range, runway or overwater).</p>
          ) : (
            <div className="rp-field">
              <AircraftPicker label="Aircraft type" value={typeId} onChange={setTypeId} year={year.year} types={ownedTypes}
                block={(t) => routeBlock(t, a, b, year.year)} memoryKey="route" />
              <div className="af-sub">
                {types.filter((t) => t.available).length} of {aircraftTypes.length} types fly this pair
                {selectedType && <span title={rangeNote(selectedType)}>{`; usable ${usableRangeKm(selectedType).toLocaleString()} km`}</span>}
              </div>
            </div>
          )}
          <div className="rc-grid2">
            <FrequencyField value={freq} onChange={setFreq} compact />
            <div className="rp-field">
              <label htmlFor="rc-lf">Target load factor <span className="hint">%, blank = off</span></label>
              <div className="rc-lf-in">
                <input id="rc-lf" type="number" inputMode="numeric" min={50} max={95} step={1} placeholder="off" value={lfText}
                  aria-invalid={!lf.ok || undefined} onChange={(e) => setLfText(e.target.value)} />
                <span aria-hidden="true">%</span>
              </div>
              <div className="rc-hint">Fares adjust to hit this</div>
            </div>
          </div>
          {hours && (
            <div className="rc-hours" aria-live="polite">
              <span>Needs <b>{hours.needed.toFixed(1)}</b> block h/wk</span>
              <span>Free at {originId}: <b className={hoursShort ? "neg" : undefined}>{Math.max(0, hours.free).toFixed(1)}</b> of {hours.available.toFixed(1)}</span>
              {hoursShort && <span className="rp-err" role="alert">Short at {originId}: fewer flights or another aircraft.</span>}
            </div>
          )}
          <FareFields text={fareText} onChange={setFareText} km={market.distanceKm} from={a} to={b} compact />
          {footMsgs.length > 0 && <div className="rc-msgs">{footMsgs.map((m) => <p key={m} className="rp-err" role="alert">{m}</p>)}</div>}
        </section>

        <div className="rc-col">
        <section className="rc-sec rc-market" aria-labelledby="rp-market">
          <h3 id="rp-market">Market</h3>
          <div className="rc-kpis">
            <Stat label="Distance" value={`${Math.round(market.distanceKm).toLocaleString()} km`} />
            <Stat label="Market / wk" value={`${Math.round(market.weeklyOneWay).toLocaleString()}`} sub="one way" />
          </div>
          <div className="seg-bar" role="img" aria-label={`Segment mix: ${mix.map((m) => `${SEG_LABEL[m]} ${pct(market.shares[m])}`).join(", ")}`}>
            {mix.map((m) => <span key={m} className={`seg-${m}`} style={{ flexGrow: market.shares[m] }} />)}
          </div>
          <ul className="seg-legend">{mix.map((m) => <li key={m}><i className={`seg-${m}`} />{SEG_LABEL[m]} {pct(market.shares[m])}</li>)}</ul>
          <p className="rc-note">
            <b>Rival:</b> {rival.directFrequency}/wk, ~{rival.directSeats} seats, ~{usd(rival.fare)}
            {rival.oneStop ? `; one-stop ~${usd(rival.oneStopFare ?? 0)}` : "; no one-stop"}.
          </p>
        </section>

        <section className="rc-sec rc-proj" aria-labelledby="rp-proj">
          <h3 id="rp-proj">Projection <span className="hint">{MONTHS[year.month]} {year.year}{livePrev ? ", your fleet" : ""}</span></h3>
          {substituted && <p className="rc-note" role="status"><b>{substituted}.</b></p>}
          {planned && <p className="rc-note" role="status"><b>Planned, not operating.</b> No free aircraft; standalone model.</p>}
          {livePrev && !livePrev.ownershipIncluded && livePrev.operatedFraction > 0 && livePrev.operatedFraction < 1 && <p className="rc-note" role="status">Fleet can fly {Math.round(livePrev.operatedFraction * 100)}% of round trips.</p>}
          <div className="rp-proj rc-proj-kpis" aria-live="polite" aria-busy={settling}>
            <div><span className="k">{settling ? "Updating" : livePrev && !livePrev.ownershipIncluded ? "Route profit/wk" : "Profit/wk"}</span><span className={`big ${!ev ? "" : ev.profit >= 0 ? "pos" : "neg"}`}>{ev ? usdSigned(ev.profit) : "–"}</span></div>
            <div><span className="k">Load factor</span><span className="big">{ev ? pct(ev.loadFactor) : "–"}</span></div>
            <div><span className="k">Share</span><span className="big">{week ? pct(week.snapshot.playerShare) : "–"}</span></div>
          </div>
          {ev && !ev.feasible && <p className="rp-err" role="alert">{ev.infeasibleReasons.join("; ")}</p>}
          {sweep.length > 0 && <FrequencyBars points={sweep} bestFreq={best?.frequency ?? null} current={freq} onPick={setFreq} />}
          {sweep.length > 0 && livePrev && <p className="rc-note">The chart shows the shape of profit by frequency on a standalone model; the headline and the button use your fleet and rivals.</p>}
          <div className="rp-actions">
            <button type="button" disabled={!useBest || useBest.frequency === freq} onClick={() => useBest && setFreq(useBest.frequency)}>
              {useBest ? `Use best: ${useBest.frequency}/wk (${usdSigned(useBest.profit)})` : best ? "This frequency is already the best" : "No feasible frequency"}
            </button>
          </div>
        </section>
        </div>
      </div>
      <div className="rc-foot">
        <button type="button" onClick={() => end()}>Cancel</button>
        <button type="button" className="primary" disabled={!typeId || !parsed || !lf.ok || !!blockedReason} title={blockedReason ?? undefined} onClick={open}>Open route</button>
      </div>
    </>
  );
}

