import { useEffect, useMemo, useState } from "react";
import {
  AMENITY_LABEL, AMENITY_LEVELS, ANCILLARY_KEYS, ANCILLARY_LABEL, BAND_LABEL, BAND_RANGE, BANDS, CREW_LABEL, CREW_LEVELS, FEE_MAX, MEAL_LABEL, MEAL_LEVELS,
  PRESETS, passengersByBand, policyError, productOf, productReport, projectedReputation, reputationLabel, satisfactionOf, type AncillaryPolicy, type Band, type ProductPolicy,
} from "@arg/sim";
import { bridge, useSim } from "../sim/useSim";
import { useToasts } from "../routes/store";
import { formatMoney } from "../sim/format";
import "../policies/policies.css";

const ARCH_LABEL: Record<string, string> = { legacy: "full-service", lcc: "low-cost", regional: "regional", interisland: "inter-island" };
const same = (a: ProductPolicy, b: ProductPolicy) => JSON.stringify(a) === JSON.stringify(b);
const usd0 = (v: number) => `$${Math.round(v)}`;
const usd2 = (v: number) => `$${v.toFixed(2)}`;
const signed = (v: number, unit = "") => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))}${unit}`;

/** Service and fees by distance band (sim policy/product.ts), with reputation and a comparison with the competitors in the player's markets. */
export default function PoliciesView() {
  useSim(); // re-render with the game
  const sim = bridge.getSim?.() ?? null;
  const push = useToasts((s) => s.push);
  const current = sim ? productOf(sim) : null;
  const [draft, setDraft] = useState<ProductPolicy | null>(null);
  useEffect(() => { if (current && !draft) setDraft(structuredClone(current.policy)); }, [current, draft]);
  const report = useMemo(() => (sim && draft ? productReport(sim, draft) : []), [sim, draft]);
  if (!sim || !current || !draft) return <div className="page"><p>Service and fee policies need the full game (not the demo data).</p></div>;

  const dirty = !same(draft, current.policy);
  const err = policyError(draft);
  const setService = (b: Band, k: "meal" | "crew" | "amenities", v: string) => setDraft({ ...draft, service: { ...draft.service, [b]: { ...draft.service[b], [k]: v } } });
  const setFee = (b: Band, k: keyof AncillaryPolicy, text: string) => {
    const n = text.trim() === "" ? 0 : Number(text);
    // Fees run from $0 (included) to the maximum; anything outside is clamped as typed.
    const v = Number.isFinite(n) ? Math.max(0, Math.min(FEE_MAX[k], Math.round(n))) : draft.ancillary[b][k];
    setDraft({ ...draft, ancillary: { ...draft.ancillary, [b]: { ...draft.ancillary[b], [k]: v } } });
  };
  const apply = () => {
    const res = bridge.dispatch({ kind: "setProductPolicy", policy: draft });
    if (res && !res.ok) push("alert", res.error.message);
    else push("good", "Service and fee policy updated. Passengers react from tomorrow; reputation follows over the coming weeks.");
  };
  const rep = current.reputation;
  // Where reputation would head under the draft policy, at today's passengers by band.
  const draftSat = satisfactionOf(draft, passengersByBand(sim));
  const hist = current.history.slice(-13);
  const trend = hist.length > 1 ? rep - hist[0]!.reputation : 0;
  const totals = report.reduce((t, r) => ({ cost: t.cost + r.serviceCostWeekly, anc: t.anc + r.ancillaryWeekly }), { cost: 0, anc: 0 });
  const now = productReport(sim);
  const nowTotals = now.reduce((t, r) => ({ cost: t.cost + r.serviceCostWeekly, anc: t.anc + r.ancillaryWeekly }), { cost: 0, anc: 0 });
  const used = report.filter((r) => r.routes > 0);

  return (
    <div className="page policies">
      <header className="page-head">
        <h1>Service and fees</h1>
        <p>Set onboard service and extra fees for each distance band, like fare categories. Better service than your competitors wins passengers (business travellers most), but only up to a point: far above the best airline in a market, extra service mostly adds cost. Too little service, or fees above what passengers expect, lose passengers and slowly damage your reputation, which then costs you on every route.</p>
      </header>

      {dirty && (
        <div className="pol-sticky" role="status">
          <span>Unsaved changes to your service and fees. With this policy, reputation heads toward <b>{signed(draftSat * 100)}</b> ({reputationLabel(draftSat)}): about <b>{signed(projectedReputation(rep, draftSat, 13) * 100)}</b> in three months.</span>
          <button className="primary" disabled={!!err} onClick={apply}>Apply policy</button>
          <button onClick={() => setDraft(structuredClone(current.policy))}>Undo</button>
        </div>
      )}
      <section className="panel-box pol-rep" aria-label="Reputation">
        <h2>Customer reputation</h2>
        <div className="pol-rep-row">
          <div className="pol-meter" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(rep * 100)} aria-label="Reputation, -100 to +100">
            <i style={{ left: `${((rep + 1) / 2) * 100}%` }} />
          </div>
          <div>
            <strong className={rep >= 0.15 ? "pos" : rep <= -0.15 ? "neg" : ""}>{reputationLabel(rep)}</strong> ({signed(rep * 100)} of ±100)
            {hist.length > 1 && <span className="hint"> · {Math.abs(trend) < 0.005 ? "steady" : trend > 0 ? "rising" : "falling"} over the last {hist.length - 1} weeks</span>}
          </div>
        </div>
        <p className="hint">Reputation moves toward how satisfied passengers are with your current policy (now {signed(current.satisfaction * 100)}), about halfway in four months{sim.product ? <>: about <b>{signed(projectedReputation(rep, current.satisfaction, 13) * 100)}</b> in three months and <b>{signed(projectedReputation(rep, current.satisfaction, 52) * 100)}</b> in a year if nothing changes</> : null}. It moves your product score on every route by up to ±9 points.{sim.product ? "" : " You are on the standard policy, so it stays at zero."}</p>
      </section>

      <section className="panel-box" aria-label="Presets">
        <h2>Start from a preset (all bands; each band also has its own preset above its column)</h2>
        <div className="pol-presets">
          <button onClick={() => setDraft(structuredClone(PRESETS.lowcost))}>Low-cost <span className="hint">buy on board, lean crew, high fees</span></button>
          <button onClick={() => setDraft(structuredClone(PRESETS.standard))}>Standard <span className="hint">what passengers expect</span></button>
          <button onClick={() => setDraft(structuredClone(PRESETS.full))}>Full service <span className="hint">meals, generous crew, few fees</span></button>
        </div>
      </section>

      <div className="table-wrap">
        <table className="data pol-table">
          <thead>
            <tr><th scope="col">By distance</th>{report.map((r) => (
              <th key={r.band} scope="col">{BAND_LABEL[r.band]}<span className="hint">{BAND_RANGE[r.band]} · {r.routes} route{r.routes === 1 ? "" : "s"}</span>
                <select className="pol-band-preset" aria-label={`Preset for ${BAND_LABEL[r.band]} only`} value="" onChange={(e) => {
                  const pr = PRESETS[e.target.value as keyof typeof PRESETS];
                  if (pr) setDraft({ ...draft, service: { ...draft.service, [r.band]: { ...pr.service[r.band] } }, ancillary: { ...draft.ancillary, [r.band]: { ...pr.ancillary[r.band] } } });
                }}>
                  <option value="">Preset for this band…</option>
                  <option value="lowcost">Low-cost</option>
                  <option value="standard">Standard</option>
                  <option value="full">Full service</option>
                </select>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            <tr><th scope="row">Passengers a week</th>{report.map((r) => <td key={r.band} className="num">{r.routes === 0 ? <span className="hint">–</span> : Math.round(r.paxPerWeek).toLocaleString("en-US")}{r.avgEconomyFareUsd !== null && <span className="hint pol-mix">avg economy fare {usd0(r.avgEconomyFareUsd)}</span>}</td>)}</tr>
            <tr className="pol-group"><th scope="rowgroup" colSpan={5}>Onboard service</th></tr>
            <tr><th scope="row">Food and drink</th>{BANDS.map((b) => (
              <td key={b}><select aria-label={`Food and drink, ${BAND_LABEL[b]}`} value={draft.service[b].meal} onChange={(e) => setService(b, "meal", e.target.value)}>{MEAL_LEVELS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select></td>
            ))}</tr>
            <tr><th scope="row">Cabin crew</th>{BANDS.map((b) => (
              <td key={b}><select aria-label={`Cabin crew, ${BAND_LABEL[b]}`} value={draft.service[b].crew} onChange={(e) => setService(b, "crew", e.target.value)}>{CREW_LEVELS.map((m) => <option key={m} value={m}>{CREW_LABEL[m]}</option>)}</select></td>
            ))}</tr>
            <tr><th scope="row">Amenities</th>{BANDS.map((b) => (
              <td key={b}><select aria-label={`Amenities, ${BAND_LABEL[b]}`} value={draft.service[b].amenities} onChange={(e) => setService(b, "amenities", e.target.value)}>{AMENITY_LEVELS.map((m) => <option key={m} value={m}>{AMENITY_LABEL[m]}</option>)}</select></td>
            ))}</tr>
            <tr className="pol-group"><th scope="rowgroup" colSpan={5}>Fees per passenger, one way ($0 = included; hover a box for its maximum)</th></tr>
            {ANCILLARY_KEYS.map((k) => (
              <tr key={k}><th scope="row">{ANCILLARY_LABEL[k]}</th>{BANDS.map((b) => (
                <td key={b}><span className="pol-fee">$<input type="number" inputMode="numeric" min={0} max={FEE_MAX[k]} step={5} title={`$0 to $${FEE_MAX[k]}`} aria-label={`${ANCILLARY_LABEL[k]} fee, ${BAND_LABEL[b]}`} value={draft.ancillary[b][k]} onChange={(e) => setFee(b, k, e.target.value)} /></span></td>
              ))}</tr>
            ))}
            <tr className="pol-group"><th scope="rowgroup" colSpan={5}>Effect per passenger</th></tr>
            <tr><th scope="row">Service cost</th>{report.map((r) => <td key={r.band} className="num">{usd2(r.servicesUsdPerPax)}</td>)}</tr>
            <tr><th scope="row">Extras revenue</th>{report.map((r) => <td key={r.band} className="num">{usd2(r.ancillaryUsdPerPax)}</td>)}</tr>
            <tr><th scope="row" title="Fees passengers expect to pay, above or below what is usual, as part of the price they compare">Price as passengers see it</th>{report.map((r) => <td key={r.band} className={`num ${r.perceivedFareUsd > 0.5 ? "neg" : r.perceivedFareUsd < -0.5 ? "pos" : ""}`}>{Math.abs(r.perceivedFareUsd) < 0.5 ? "as usual" : `${r.perceivedFareUsd > 0 ? "+" : "−"}${usd0(Math.abs(r.perceivedFareUsd))}`}</td>)}</tr>
            <tr><th scope="row" title="Service points above or below what passengers expect for the distance">Service vs expectation</th>{report.map((r) => <td key={r.band} className={`num ${r.pointsVsExpected > 0 ? "pos" : r.pointsVsExpected < 0 ? "neg" : ""}`}>{r.pointsVsExpected === 0 ? "as expected" : signed(r.pointsVsExpected, " pts")}</td>)}</tr>
            <tr><th scope="row" title="0-100. Your product (service and reputation) and the competitors' in the markets you fly">Product score: you / competitors</th>{report.map((r) => (
              <td key={r.band} className="num">
                {r.routes === 0 ? <span className="hint">no routes</span> : <>
                  <b className={r.rivalScore === null ? "" : r.playerScore >= r.rivalScore + 4 ? "pos" : r.playerScore <= r.rivalScore - 4 ? "neg" : ""}>{r.playerScore}</b> / {r.rivalScore ?? "–"}
                  <span className="hint pol-mix">{mixText(r.rivalMix)}</span>
                </>}
              </td>
            ))}</tr>
          </tbody>
        </table>
      </div>

      <p className="hint pol-legend"><b>How to read the effect rows.</b> <i>Price as passengers see it</i>: how much more (red) or less (green) your fees make a ticket feel than the usual fees, when passengers compare airlines. <i>Service vs expectation</i>: service points above (green) or below (red) what passengers expect for the distance. <i>Product score</i>, 0 to 100: your service and reputation against the competitors' in the markets you fly; green when you are 4 or more points ahead, red when 4 or more behind.</p>
      {used.length > 0 && <Advice report={used} />}

      <section className="panel-box pol-totals" aria-label="Weekly effect">
        <h2>Weekly effect at today's passenger numbers</h2>
        <p>Service cost {formatMoney(totals.cost)} <span className="hint">(change {formatMoney(totals.cost - nowTotals.cost, { sign: true })})</span> · extras revenue {formatMoney(totals.anc)} <span className="hint">(change {formatMoney(totals.anc - nowTotals.anc, { sign: true })})</span></p>
        <p className="hint">These are at today's passengers, before they react. A better product or lower fees win passengers from competitors and a worse one loses them. On full flights you see it in who flies, not in the load factor: high-paying local and business passengers are replaced by cheaper connecting and leisure ones, and routes with a target load factor re-price their fares each week. Watch revenue per passenger and the average fare above.</p>
        {err && <p className="rp-err" role="alert">{err}</p>}
        <div className="pol-actions">
          <button className="primary" disabled={!dirty || !!err} onClick={apply}>Apply policy</button>
          <button disabled={!dirty} onClick={() => setDraft(structuredClone(current.policy))}>Undo changes</button>
          {!dirty && <span className="hint" role="status">No changes to apply: this is your current policy.</span>}
        </div>
      </section>
    </div>
  );
}

function mixText(mix: Partial<Record<string, number>>): string {
  const parts = Object.entries(mix).filter(([, v]) => (v ?? 0) >= 0.1).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([k, v]) => `${Math.round((v ?? 0) * 100)}% ${ARCH_LABEL[k] ?? k}`);
  return parts.length === 0 ? "no competitors" : parts.join(", ");
}

/** Plain-language reading of the comparison, one line per band the player flies. */
function Advice({ report }: { report: ReturnType<typeof productReport> }) {
  const lines = report.map((r) => {
    const name = BAND_LABEL[r.band].toLowerCase();
    if (r.rivalScore === null) return `${BAND_LABEL[r.band]}: no competitors in your markets, so extra service wins little; passengers still judge you against what they expect.`;
    const gap = r.playerScore - r.rivalScore;
    if (gap >= 8) return `${BAND_LABEL[r.band]}: you are well above the competition (${gap} points). Beyond about 4 points, extra service adds cost but few passengers; consider trimming it.`;
    if (gap <= -8) return `${BAND_LABEL[r.band]}: competitors offer a clearly better product (${-gap} points). Expect to lose ${name} business travellers unless your fares are lower.`;
    return `${BAND_LABEL[r.band]}: close to the competition (${gap >= 0 ? "+" : ""}${gap}). Price and frequency decide most passengers here.`;
  });
  return <section className="panel-box pol-advice" aria-label="Reading"><h2>Reading</h2><ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul></section>;
}
