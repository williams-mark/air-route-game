import { useState } from "react";
import type { CampaignReview as Review } from "@arg/sim";
import { formatMoney } from "../sim/format";
import { bridge, useSim } from "../sim/useSim";
import { useUi } from "../store";
import { useToasts } from "../routes/store";
import { saveToSlot } from "../save/saves";
import { Modal } from "./Modal";
import "./campaign.css";

const pct = (x: number | null) => (x === null ? "no routes" : `${(x * 100).toFixed(1)}%`);
const signed = (usd: number) => (usd < 0 ? `-${formatMoney(-usd)}` : formatMoney(usd));
const multipleText = (m: number) => `${m.toFixed(2)}x`;

/** The fleet as "3 B737-800, 2 A320". */
const fleetText = (r: Review) => (r.fleet.length === 0 ? "none in service" : r.fleet.map((f) => `${f.count} ${f.name}`).join(", "));

/** Campaign review: shown once when the campaign reaches its end date. The only way on is Keep playing, load, or a new game. */
export function CampaignReviewCard() {
  const sim = useSim();
  const setDialog = useUi((s) => s.setSaveDialog);
  const setStart = useUi((s) => s.setStartOpen);
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const r = sim.review;
  if (!r) return null;
  const sc = r.score;

  const keepPlaying = async () => {
    setBusy(true);
    // Endless from now on. The autosave is written at once so a reload comes back to the endless game, not to this review.
    bridge.dispatch({ kind: "continueEndless" });
    const o = await saveToSlot(bridge, "auto");
    setBusy(false);
    if (!o.ok) push("alert", o.message);
  };

  return (
    <Modal label="Campaign review" scrimClassName="scrim" className="gameover-card campaign-review" initialFocus="button.primary" closeOnEscape={false} closeOnBackdrop={false} onClose={() => undefined}>
      <div className="review-head">
        <div>
          <h1>{r.airline}: campaign review</h1>
          <p>{r.yearsPlayed} years, {r.startYear} to {r.endYear}. The campaign has reached its end date and the sim is paused.</p>
        </div>
        <div className={`review-grade grade-${sc.grade}`} aria-label={`Grade ${sc.grade}`}>
          <span className="review-letter">{sc.grade}</span>
          <span className="review-mult">{multipleText(sc.multiple)} start</span>
        </div>
      </div>

      <section className="review-score" aria-label="Score">
        <h2>Final equity {signed(sc.equityUsd)}</h2>
        <p className="review-formula">
          Equity = cash {signed(sc.cashUsd)} + owned aircraft {signed(sc.aircraftUsd)} + purchased aircraft on order, at the price paid {signed(sc.orderedUsd)} - owed on them {signed(sc.owedUsd)}. Leased aircraft count for nothing.
          Grade: A at 3x the starting cash or more, B at 2x, C at 1x, D at 0x, F below zero.
        </p>
      </section>

      <dl className="mini" aria-label="Summary">
        <dt>Final cash</dt><dd className={r.finalCashUsd < 0 ? "neg" : ""}>{signed(r.finalCashUsd)}</dd>
        <dt>Peak cash</dt><dd>{signed(r.peakCashUsd)}</dd>
        <dt>Total profit</dt><dd className={r.totalProfitUsd < 0 ? "neg" : ""}>{signed(r.totalProfitUsd)}</dd>
        <dt>Fleet</dt><dd>{r.fleetCount} in service{r.onOrder > 0 ? `, ${r.onOrder} on order` : ""}</dd>
        <dt>Types</dt><dd>{fleetText(r)}</dd>
        <dt>Routes</dt><dd>{r.routes}</dd>
        <dt>Average load factor</dt><dd>{pct(r.averageLoadFactor)}</dd>
        <dt>Hubs</dt><dd>{r.hubs.map((h) => h.id).join(", ")}</dd>
      </dl>

      <section aria-label="Profit by year">
        <h2>Profit by year</h2>
        <table className="review-years">
          <thead><tr><th scope="col">Year</th><th scope="col">Profit</th></tr></thead>
          <tbody>
            {r.profitByYear.map((p) => (
              <tr key={p.year}><th scope="row">{p.year}</th><td className={p.profitUsd < 0 ? "neg" : ""}>{signed(p.profitUsd)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {r.rivals && (
        <section aria-label="Rivals">
          <h2>Against the rivals</h2>
          <dl className="mini">
            <dt>Still flying</dt><dd>{r.rivals.active} of {r.rivals.active + r.rivals.bankrupt} rivals ({r.rivals.bankrupt} failed)</dd>
            <dt>Median rival</dt><dd>{r.rivals.medianFleet} aircraft, {r.rivals.medianRoutes} routes, {signed(r.rivals.medianCashUsd)} cash</dd>
            <dt>Your rank</dt><dd>#{r.rivals.fleetRank} by fleet, #{r.rivals.routeRank} by routes</dd>
          </dl>
        </section>
      )}

      <div className="gameover-actions">
        <button className="primary" disabled={busy} onClick={keepPlaying}>Keep playing (endless)</button>
        <button onClick={() => setDialog("load")}>Load a save</button>
        <button onClick={() => setStart(true)}>New game</button>
      </div>
    </Modal>
  );
}
