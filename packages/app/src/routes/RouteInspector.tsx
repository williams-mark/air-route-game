import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CabinClass, Route } from "@arg/contracts";
import { airportById, aircraftTypes } from "@arg/data";
import { dayToDate } from "@arg/sim";
import { useUi } from "../store";
import { bridge, useSim } from "../sim/useSim";
import { IconAlert } from "../shell/icons";
import { MonthBars } from "./charts";
import { FareFields, FrequencyField, Stat, useDebounced } from "./editor";
import { CABINS, CABIN_NAME, FREQ_MAX, faresToText, parseFares, profitTier, projectRoute, routeName, seasonalProfit } from "./helpers";
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
  const { day, reports } = useSim();
  const select = useUi((s) => s.select);
  const push = useToasts((s) => s.push);
  const [freq, setFreq] = useState(route.weeklyFrequency);
  const [fares, setFares] = useState(() => faresToText(route.fares));
  const [confirming, setConfirming] = useState(false);
  const headRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { headRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  // Reset the editor when the saved route changes underneath us (after Apply, or sim edits).
  const savedKey = `${route.weeklyFrequency}|${JSON.stringify(route.fares)}`;
  useEffect(() => { setFreq(route.weeklyFrequency); setFares(faresToText(route.fares)); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const wkDay = Math.floor(day / 7) * 7;
  const a = airportById.get(route.origin), b = airportById.get(route.destination);
  const type = aircraftTypes.find((t) => t.id === route.typeId);
  // The sim's own report when there is one (real bridge); otherwise a projection from the route model.
  const report = reports[route.id];
  const projected = useMemo(() => (report ? null : projectRoute(route, wkDay)), [report, route, wkDay]);
  const week = report ? { evaluation: report.evaluation, snapshot: report.market } : projected;
  const sched = report?.scheduling ?? null;
  const ev = week?.evaluation;
  const months = useMemo(() => seasonalProfit(route, wkDay), [route, wkDay]);

  const parsed = parseFares(fares);
  const draftRoute: Route = useMemo(() => ({ ...route, weeklyFrequency: freq, fares: parsed ?? route.fares }), [route, freq, parsed?.Y, parsed?.W, parsed?.J, parsed?.F]); // eslint-disable-line react-hooks/exhaustive-deps
  const debounced = useDebounced(draftRoute, 220);
  const settling = debounced !== draftRoute;
  const proj = useMemo(() => projectRoute(debounced, wkDay)?.evaluation, [debounced, wkDay]);
  const dirty = freq !== route.weeklyFrequency || JSON.stringify(parsed) !== JSON.stringify(route.fares);
  const canApply = dirty && !!parsed && freq >= 1 && freq <= FREQ_MAX && !settling;
  const delta = proj && ev ? proj.profit - ev.profit : 0;

  const apply = () => {
    if (!parsed) return;
    const res = bridge.dispatch({ kind: "updateRoute", id: route.id, patch: { weeklyFrequency: freq, fares: parsed } });
    if (res && !res.ok) push("alert", res.error.message);
    else push("good", `Updated ${routeName(route)}: ${freq}/wk, economy ${usd(parsed.Y)}.`);
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
          <p>{a?.city} to {b?.city} {"·"} {Math.round(ev.distanceKm).toLocaleString()} km {"·"} {type?.name ?? route.typeId} {"·"} {tierWord}</p>
        </div>
        <button ref={headRef} className="icon-btn" aria-label="Close route inspector" title="Close (Esc)" onClick={() => select(null)}>{"✕"}</button>
      </header>
      <div className="rp-scroll">
        {!ev.feasible && (
          <div className="rp-alert" role="alert"><IconAlert size={16} /><div><b>This aircraft cannot operate the route</b><ul>{ev.infeasibleReasons.map((r) => <li key={r}>{r}</li>)}</ul></div></div>
        )}
        <section aria-label="Key figures" className="rp-stats">
          <Stat label="Profit / week" value={usdSigned(ev.profit)} tone={ev.profit >= 0 ? "pos" : "neg"} sub={`${pct(ev.margin)} margin`} />
          <Stat label="Load factor" value={pct(ev.loadFactor)} sub={`${Math.round(ev.passengersPerWeek).toLocaleString()} of ${Math.round(ev.seatsPerWeek).toLocaleString()} seats`} />
          <Stat label="Break-even load" value={ev.breakEvenLoadFactor === null ? "n/a" : pct(ev.breakEvenLoadFactor)} sub={ev.breakEvenLoadFactor !== null && ev.loadFactor > ev.breakEvenLoadFactor ? "Above break-even" : "Below break-even"} />
          <Stat label="Market share" value={pct(week.snapshot.playerShare)} sub={`of ${Math.round(week.snapshot.weeklyDemand).toLocaleString()} potential pax/wk`} />
        </section>
        {sched && sched.underSupplied > 0 && (
          <div className="rp-alert" role="status"><IconAlert size={16} /><div><b>Under-supplied: {sched.scheduledFrequency} of {route.weeklyFrequency} round trips a week can be flown</b>
            <ul><li>Not enough free aircraft of this type. Order more, or lower the frequency.</li></ul></div></div>
        )}

        <section aria-labelledby="rp-sched" className="rp-sec">
          <h3 id="rp-sched">Schedule and fares</h3>
          <dl className="mini rp-dl">
            <dt>Frequency</dt><dd>{route.weeklyFrequency} per week each way ({ev.flightsPerWeek} flights)</dd>
            <dt>Aircraft</dt><dd>{route.typeId}, {ev.seatsPerFlight} seats, {sched ? `${sched.aircraftIds.length} assigned` : `${ev.aircraftEquivalent.toFixed(1)} needed`}</dd>
            {CABINS.slice().reverse().map((c) => cabinFare(c) !== undefined && (<Fragment key={c}><dt>{CABIN_NAME[c]}</dt><dd>{usd(cabinFare(c)!)}</dd></Fragment>))}
          </dl>
        </section>

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
          <h3 id="rp-season">Seasonal profit, {year.year} <span className="hint">(per month)</span></h3>
          <MonthBars months={months} label={`Monthly profit for ${routeName(route)} in ${year.year}.`} />
        </section>

        <section aria-labelledby="rp-edit" className="rp-sec rp-edit">
          <h3 id="rp-edit">Adjust</h3>
          <FrequencyField value={freq} onChange={setFreq} />
          <FareFields text={fares} onChange={setFares} km={ev.distanceKm} />
          <div className="rp-proj" aria-live="polite" aria-busy={settling}>
            <div>
              <span className="k">Projected profit / week</span>
              <span className={`big ${!proj ? "" : proj.profit >= 0 ? "pos" : "neg"}`}>{proj ? usdSigned(proj.profit) : "–"}</span>
            </div>
            <div>
              <span className="k">{settling ? "Updating…" : "Change"}</span>
              <span className={`big ${delta >= 0 ? "pos" : "neg"}`}>{dirty && proj ? usdSigned(delta) : "none"}</span>
            </div>
            <div>
              <span className="k">Load factor</span>
              <span className="big">{proj ? pct(proj.loadFactor) : "–"}</span>
            </div>
          </div>
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
