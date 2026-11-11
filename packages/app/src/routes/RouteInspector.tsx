import { shortTypeLabel, typeShortName } from "../aircraft/names";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CabinClass, Route } from "@arg/contracts";
import { airportById, aircraftTypes } from "@arg/data";
import { SERVICE_LEVEL_NAME, connectingShare, dayToDate, playerHubs } from "@arg/sim";
import { cabinLoadsOf } from "../hubboard/hubBoard";
import { useUi } from "../store";
import { bridge, useSim } from "../sim/useSim";
import { IconAlert } from "../shell/icons";
import { MonthBars } from "./charts";
import { FareFields, FrequencyField, Stat, useDebounced } from "./editor";
import { CABINS, CABIN_NAME, FREQ_MAX, describeEffectiveTarget, describeTargetLf, faresToText, formatTargetLf, liveSeasonal, livePreview, operatingMix, parseFares, parseTargetLf, ownershipReason, profitTier, projectRoute, routeName, seasonalProfit, substitutionText, typeOwnership } from "./helpers";
import { pct, usd, usdSigned } from "./fmt";
import { useToasts } from "./store";
import { RouteAircraft } from "./RouteAircraft";
import { CompetitionBlock } from "../rivals/CompetitionBlock";
import type { LedgerLine } from "@arg/sim";

const MONTHS_LONG = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function LedgerRow({ line, sign }: { line: LedgerLine; sign: 1 | -1 }) {
  const id = useId();
  return (
    <li className="ledger-row" tabIndex={0} aria-describedby={id}>
      <span className="l">{line.label}</span>
      <span className="r">{sign < 0 ? "−" : ""}{usd(line.weekly)}</span>
      <span role="tooltip" id={id} className="ledger-tip"><b>How this is worked out</b>{line.formula}</span>
    </li>
  );
}

export function RouteInspector({ route }: { route: Route }) {
  const { day, reports, fleet } = useSim();
  const select = useUi((s) => s.select);
  const push = useToasts((s) => s.push);
  const [freq, setFreq] = useState(route.weeklyFrequency);
  const [fares, setFares] = useState(() => faresToText(route.fares));
  const [confirming, setConfirming] = useState(false);
  const [lfText, setLfText] = useState(() => formatTargetLf(route.targetLoadFactor));
  const [lfError, setLfError] = useState<string | null>(null);
  const lfId = useId();
  const headRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { headRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  // Reset the editor when the saved route changes underneath us (after Apply, or sim edits).
  const savedKey = `${route.weeklyFrequency}|${JSON.stringify(route.fares)}`;
  useEffect(() => { setFreq(route.weeklyFrequency); setFares(faresToText(route.fares)); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLfText(formatTargetLf(route.targetLoadFactor)); setLfError(null); }, [route.targetLoadFactor]);

  const wkDay = Math.floor(day / 7) * 7;
  // A fare policy covering the route re-prices it every week; say so, because that overwrites any fare typed below.
  const simNow = bridge.getSim?.() ?? null;
  const effTarget = describeEffectiveTarget(route, simNow?.world.farePolicies, simNow?.airports, simNow ? playerHubs(simNow) : undefined);
  const a = airportById.get(route.origin), b = airportById.get(route.destination);
  const type = aircraftTypes.find((t) => t.id === route.typeId);
  // The sim's own report when there is one (real bridge); otherwise a projection from the route model.
  const report = reports[route.id];
  const projected = useMemo(() => (report ? null : projectRoute(route, wkDay)), [report, route, wkDay]);
  const week = report ? { evaluation: report.evaluation, snapshot: report.market } : projected;
  const sched = report?.scheduling ?? null;
  const ev = week?.evaluation;
  // Passengers and experience: per-cabin load (flown cabins only; an empty one shows 0%), connecting share, experience per cabin.
  const paxCabins = ev ? cabinLoadsOf(ev) : [];
  const connPax = report?.connecting?.passengersOneWay ?? 0;
  const connShare = ev ? connectingShare(connPax, ev.passengersPerWeek) : 0;
  const exp = report?.experience;
  const cabinExpText = (cls: CabinClass) => {
    const e = exp?.byCabin[cls];
    return e ? ` · ${SERVICE_LEVEL_NAME[e.serviceLevel]} service, fares x${e.fareMultiplier.toFixed(2)}` : "";
  };
  // Forecasts run the same model as the daily report (assigned aircraft, real rivals, hub traffic, ownership treatment); the mock bridge has no sim and keeps the standalone projection.
  const sim = bridge.getSim?.() ?? null;
  const live = sim !== null;
  const months = useMemo(() => liveSeasonal(sim, route.id, wkDay) ?? seasonalProfit(route, wkDay), [route, wkDay, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const mix = useMemo(() => operatingMix(sched, fleet), [sched, fleet]);
  const substituted = substitutionText(route.typeId, mix, shortTypeLabel);
  const ownership = typeOwnership(fleet, route.typeId, route.id);
  const stand = fleet.find((f) => f.status === "active" && f.typeId !== route.typeId);

  const parsed = parseFares(fares);
  const draftRoute: Route = useMemo(() => ({ ...route, weeklyFrequency: freq, fares: parsed ?? route.fares }), [route, freq, parsed?.Y, parsed?.W, parsed?.J, parsed?.F]); // eslint-disable-line react-hooks/exhaustive-deps
  const debounced = useDebounced(draftRoute, 220);
  const settling = debounced !== draftRoute;
  const dirty = freq !== route.weeklyFrequency || JSON.stringify(parsed) !== JSON.stringify(route.fares);
  // Preview = the live model with the change applied; "current" is the route report above, so an unchanged route previews to exactly its live profit.
  const preview = useMemo(
    () => (dirty ? livePreview(sim, route.id, { weeklyFrequency: debounced.weeklyFrequency, fares: debounced.fares }) : null),
    [dirty, live, route.id, debounced, report?.day], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const standalone = useMemo(() => (!live && dirty ? projectRoute(debounced, wkDay)?.evaluation : undefined), [live, dirty, debounced, wkDay]);
  const proj = preview ? preview.proposed : standalone ? { profit: standalone.profit, loadFactor: standalone.loadFactor } : undefined;
  const canApply = dirty && !!parsed && freq >= 1 && freq <= FREQ_MAX && !settling;
  const delta = preview ? preview.delta.profit : proj && ev ? proj.profit - ev.profit : 0;

  const apply = () => {
    if (!parsed) return;
    const res = bridge.dispatch({ kind: "updateRoute", id: route.id, patch: { weeklyFrequency: freq, fares: parsed } });
    if (res && !res.ok) push("alert", res.error.message);
    else push("good", `Updated ${routeName(route)}: ${freq}/wk, economy ${usd(parsed.Y)}.`);
  };
  const lfParsed = parseTargetLf(lfText);
  const lfShown = lfError ?? (lfParsed.ok ? null : lfParsed.message);
  const lfDirty = lfParsed.ok && (lfParsed.value ?? undefined) !== route.targetLoadFactor;
  const applyTargetLf = () => {
    if (!lfParsed.ok) { setLfError(lfParsed.message); return; }
    const res = bridge.dispatch({ kind: "updateRoute", id: route.id, patch: { targetLoadFactor: lfParsed.value } });
    if (res && !res.ok) { setLfError(res.error.message); push("alert", res.error.message); return; }
    setLfError(null);
    push("good", lfParsed.value === null ? `Cleared the target load factor on ${routeName(route)}.` : `Target load factor ${formatTargetLf(lfParsed.value)}% on ${routeName(route)}.`);
  };
  const closeRoute = () => {
    const res = bridge.dispatch({ kind: "closeRoute", id: route.id });
    if (res && !res.ok) { push("alert", res.error.message); setConfirming(false); return; }
    push("info", `Closed ${routeName(route)}.`);
    select(null);
  };

  if (!ev || !week) return (
    <div className="rp-body"><p>This route cannot be evaluated (unknown airport or aircraft).</p></div>
  );
  const tier = profitTier(ev.margin, ev.feasible);
  const tierWord = { profit: "Profitable", marginal: "Marginal", loss: "Losing money", planned: "Planned" }[tier];
  const revenueLines = ev.lines.filter((l) => l.group === "revenue");
  const costLines = ev.lines.filter((l) => l.group === "cost");
  const cabinFare = (c: CabinClass): number | undefined => route.fares[c] ?? (c === "Y" ? route.fares.Y : undefined);
  const year = dayToDate(wkDay);

  return (
    <>
      <header className="rp-head">
        <div>
          <h2 id="rp-title"><span className={`dot tier-${tier}`} aria-hidden="true" />{routeName(route)}</h2>
          <p>{a?.city} to {b?.city} {"·"} {Math.round(ev.distanceKm).toLocaleString()} km {"·"} {substituted ?? (type ? typeShortName(type) : route.typeId)} {"·"} {tierWord}</p>
        </div>
        <button ref={headRef} className="icon-btn" aria-label="Close route inspector" title="Close (Esc)" onClick={() => select(null)}>{"✕"}</button>
      </header>
      <div className="rp-scroll">
        {!ev.feasible && (
          <div className="rp-alert" role="alert"><IconAlert size={16} /><div><b>This aircraft cannot operate the route</b><ul>{ev.infeasibleReasons.map((r) => <li key={r}>{r}</li>)}</ul></div></div>
        )}
        <section aria-label="Key figures" className="rp-stats">
          <Stat label="Route profit / week" value={usdSigned(ev.profit)} tone={ev.profit >= 0 ? "pos" : "neg"}
            sub={`${pct(ev.margin)} margin, ${report && !report.notionalFleet ? "before aircraft ownership and overhead" : "incl. notional aircraft cost"}`} />
          <Stat label="Load factor" value={pct(ev.loadFactor)} sub={`${Math.round(ev.passengersPerWeek).toLocaleString()} of ${Math.round(ev.seatsPerWeek).toLocaleString()} seats`} />
          <Stat label="Break-even load" value={ev.breakEvenLoadFactor === null ? "n/a" : pct(ev.breakEvenLoadFactor)} sub={ev.breakEvenLoadFactor !== null && ev.loadFactor > ev.breakEvenLoadFactor ? "Above break-even" : "Below break-even"} />
          <Stat label="Market share" value={pct(week.snapshot.playerShare)} sub={`of ${Math.round(week.snapshot.weeklyDemand).toLocaleString()} potential pax/wk`} />
        </section>
        {(substituted || (!report && ownership.owned === 0 && route.typeId)) && (
          <div className="rp-alert" role="status"><IconAlert size={16} /><div>
            <b>{substituted ?? `Planned ${shortTypeLabel(route.typeId)}, no ${shortTypeLabel(route.typeId)} in your fleet yet`}</b>
            <ul><li>
              {substituted
                ? `${ownershipReason(shortTypeLabel(route.typeId), ownership)}, so the scheduler is substituting. Seats, fuel, crew and fees below use the aircraft actually flying.`
                : `The scheduler will substitute ${stand ? `another aircraft such as your ${stand.typeId}` : "whatever it can find"} until you have one.`}
            </li></ul></div></div>
        )}
        {sched && sched.underSupplied > 0 && (
          <div className="rp-alert" role="status"><IconAlert size={16} /><div><b>Under-supplied: {sched.scheduledFrequency} of {route.weeklyFrequency} round trips a week can be flown</b>
            <ul><li>Not enough free aircraft of this type. Order more, or lower the frequency.</li></ul></div></div>
        )}

        <section aria-labelledby="rp-sched" className="rp-sec">
          <h3 id="rp-sched">Schedule and fares</h3>
          <dl className="mini rp-dl">
            <dt>Frequency</dt><dd>{route.weeklyFrequency} per week each way ({ev.flightsPerWeek} flights)</dd>
            <dt>Target load factor</dt><dd>{effTarget.text}</dd>
            <dt>Aircraft</dt><dd>{substituted ?? shortTypeLabel(route.typeId)}, {Math.round(ev.seatsPerFlight)} seats per flight, {sched ? `${sched.aircraftIds.length} assigned` : `${ev.aircraftEquivalent.toFixed(1)} needed`}</dd>
            {CABINS.slice().reverse().map((c) => cabinFare(c) !== undefined && (<Fragment key={c}><dt>{CABIN_NAME[c]}</dt><dd>{usd(cabinFare(c)!)}</dd></Fragment>))}
          </dl>
        </section>

        {ev && (
          <section aria-labelledby="rp-pax" className="rp-sec">
            <h3 id="rp-pax">Passengers <span className="hint">(per week, both directions)</span></h3>
            <dl className="mini rp-dl">
              <dt>Load factor</dt><dd>{pct(ev.loadFactor)} overall, {Math.round(ev.passengersPerWeek).toLocaleString()} of {Math.round(ev.seatsPerWeek).toLocaleString()} seats</dd>
              {paxCabins.map((c) => (
                <Fragment key={c.cls}>
                  <dt>{CABIN_NAME[c.cls]} load</dt>
                  <dd>{pct(c.loadFactor ?? 0)}, {Math.round(c.passengersPerWeek).toLocaleString()} of {Math.round(c.seatsPerWeek).toLocaleString()} seats{cabinExpText(c.cls)}</dd>
                </Fragment>
              ))}
              <dt>Connecting</dt>
              <dd>{pct(connShare)} of passengers{connPax > 0 ? `, ${Math.round(connPax).toLocaleString()} a week each way` : " (no hub connections on this route)"}</dd>
              <dt>Passenger experience</dt>
              <dd>{exp ? `${Math.round(exp.score)} / 100` : "shown after the next daily report"}</dd>
            </dl>
          </section>
        )}

        <RouteAircraft route={route} />

        <CompetitionBlock route={route} yourWeeklySeats={ev.seatsPerWeek} />

        <section aria-labelledby="rp-why" className="rp-sec">
          <h3 id="rp-why">Why this profit <span className="hint">(per week; hover or focus a line for the formula)</span></h3>
          <ul className="ledger" aria-label="Revenue lines">{revenueLines.map((l) => <LedgerRow key={l.key} line={l} sign={1} />)}</ul>
          <div className="ledger-total"><span>Revenue</span><span>{usd(ev.revenue)}</span></div>
          <ul className="ledger" aria-label="Cost lines">{costLines.map((l) => <LedgerRow key={l.key} line={l} sign={-1} />)}</ul>
          <div className="ledger-total"><span>Costs</span><span>{"−"}{usd(ev.costs)}</span></div>
          <div className={`ledger-total grand ${ev.profit >= 0 ? "pos" : "neg"}`}><span>Profit</span><span>{usdSigned(ev.profit)}</span></div>
        </section>

        <section aria-labelledby="rp-season" className="rp-sec">
          <h3 id="rp-season">Seasonal route profit, {year.year} <span className="hint">(per month{live ? "; today's fleet, rivals and costs, no daily noise" : ""})</span></h3>
          <MonthBars months={months} label={`Monthly profit for ${routeName(route)} in ${year.year}.`} />
        </section>

        <section aria-labelledby="rp-edit" className="rp-sec rp-edit">
          <h3 id="rp-edit">Adjust</h3>
          <FrequencyField value={freq} onChange={setFreq} />
          <FareFields text={fares} onChange={setFares} km={ev.distanceKm} from={airportById.get(route.origin)} to={airportById.get(route.destination)} />
          {effTarget.policyName && <p className="rp-err" role="note">Fare policy "{effTarget.policyName}" re-prices this route every week to hit its target, so a fare typed here will not last. Set a target on this route to take it over, or take the route out of the policy.</p>}
          <div className="rp-field rp-lf">
            <label htmlFor={lfId}>Target load factor <span className="hint">%, 50-95, blank = off</span></label>
            <div className="rp-lf-row">
              <input id={lfId} type="number" inputMode="numeric" min={50} max={95} step={1} placeholder="off" value={lfText}
                aria-invalid={!lfParsed.ok || undefined} onChange={(e) => { setLfText(e.target.value); setLfError(null); }} />
              <button type="button" disabled={!lfDirty} onClick={applyTargetLf}>Set target</button>
            </div>
            {lfShown && <p className="rp-err" role="alert">{lfShown}</p>}
          </div>
          <div className="rp-proj" aria-live="polite" aria-busy={settling}>
            <div>
              <span className="k">Route profit / week now</span>
              <span className={`big ${ev.profit >= 0 ? "pos" : "neg"}`}>{usdSigned(ev.profit)}</span>
            </div>
            <div>
              <span className="k">With your change</span>
              <span className={`big ${!dirty || !proj ? "" : proj.profit >= 0 ? "pos" : "neg"}`}>{dirty && proj ? usdSigned(proj.profit) : "–"}</span>
            </div>
            <div>
              <span className="k">{settling ? "Updating…" : "Change"}</span>
              <span className={`big ${delta >= 0 ? "pos" : "neg"}`}>{dirty && proj ? usdSigned(delta) : "none"}</span>
            </div>
            <div>
              <span className="k">Load factor</span>
              <span className="big">{dirty && proj ? pct(proj.loadFactor) : pct(ev.loadFactor)}</span>
            </div>
          </div>
          {dirty && preview && (
            <p className="rp-note">
              {preview.otherRoutesDelta !== 0 && Math.abs(preview.otherRoutesDelta) >= 1
                ? `Other routes: ${usdSigned(preview.otherRoutesDelta)} a week (connecting passengers and shared aircraft), so the company effect is ${usdSigned(preview.delta.profit + preview.otherRoutesDelta)}. `
                : "No effect on your other routes. "}
              {preview.ownershipTreatmentChanges ? "This change moves the route between owned and notional aircraft, so lease cost enters or leaves the route figure. " : ""}
              Route profit is operating contribution: {preview.ownershipIncluded ? "it includes a notional lease charge for aircraft you do not own" : "aircraft ownership and corporate overhead are charged to the company, not to the route"}.
              Everything but your change is held as in the {MONTHS_LONG[dayToDate(preview.day).month]} {dayToDate(preview.day).year} report: aircraft flying it, rivals, date and costs.
            </p>
          )}
          {!parsed && <p className="rp-err" role="alert">Economy fare is required; other cabins must be positive numbers or blank.</p>}
          <div className="rp-actions">
            <button type="button" className="primary" disabled={!canApply} onClick={apply}>Apply changes</button>
            <button type="button" disabled={!dirty} onClick={() => { setFreq(route.weeklyFrequency); setFares(faresToText(route.fares)); }}>Reset</button>
          </div>
        </section>

        <section className="rp-sec rp-danger">
          {!confirming ? (
            <button type="button" className="danger" onClick={() => setConfirming(true)}>Close route{"…"}</button>
          ) : (
            <div role="alertdialog" aria-labelledby="rp-confirm-t" aria-describedby="rp-confirm-d" className="rp-confirm"
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setConfirming(false); } }}>
              <strong id="rp-confirm-t">Close {routeName(route)}?</strong>
              <p id="rp-confirm-d">All {ev.flightsPerWeek} weekly flights stop. {ev.profit >= 0 ? `You give up about ${usd(ev.profit)} of profit per week.` : `You stop losing about ${usd(-ev.profit)} per week.`} You can open it again later.</p>
              <div className="rp-actions">
                <button type="button" onClick={() => setConfirming(false)}>Keep route</button>
                <button ref={confirmRef} type="button" className="danger solid" onClick={closeRoute}>Close route</button>
              </div>
            </div>
          )}
        </section>
        <p className="rp-foot">{report ? `Latest sim week, ${MONTHS_LONG[dayToDate(report.day).month]} ${dayToDate(report.day).year}. Route profit is before aircraft lease and corporate overhead, which the airline pays whether or not the aircraft fly.` : `Figures use the sim's route model for ${MONTHS_LONG[year.month]} ${year.year}; actual results vary with fleet and events.`}</p>
      </div>
    </>
  );
}
