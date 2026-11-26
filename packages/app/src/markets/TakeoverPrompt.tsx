import { useState } from "react";
import { marketOf, mergePreview } from "@arg/sim";
import { bridge, useSim } from "../sim/useSim";
import { useUi } from "../store";
import { useToasts } from "../routes/store";
import { formatDate, formatMoney } from "../sim/format";
import { Modal } from "../shell/Modal";

/**
 * A competitor's offer for the player's airline: the game pauses and this card asks for an answer (accept, decline, or decide later on
 * the Markets screen before it expires). "Later" hides it until the next offer.
 */
/** Offers the player chose to decide later on Markets, kept for the session so the window does not come back when it remounts. */
const deferred = new Set<string>();

export function TakeoverPrompt() {
  useSim();
  const sim = bridge.getSim?.() ?? null;
  const [later, setLater] = useState<string | null>(null);
  const [keepName, setKeepName] = useState(false);
  const push = useToasts((s) => s.push);
  const bid = sim ? marketOf(sim).incoming[0] : undefined;
  if (!sim || !bid || later === bid.id || deferred.has(bid.id)) return null;
  // The value quoted is the one the offer was based on (the same figure the notice gave).
  const v = bid.valueUsd;
  const pv = mergePreview(sim, bid.id);
  const answer = (accept: boolean) => {
    const r = bridge.dispatch({ kind: "respondToBid", bidId: bid.id, accept, keepName });
    if (r && !r.ok) push("alert", r.error.message); else push(accept ? "good" : "info", r?.message ?? "Done.");
  };
  return (
    <Modal label="Takeover offer" className="dialog takeover-card" initialFocus="h2" onClose={() => { deferred.add(bid.id); setLater(bid.id); }}>
      <h2 tabIndex={-1}>Takeover offer from {bid.rivalName}</h2>
      <p><b>{bid.rivalName}</b> offers <b>{formatMoney(bid.priceUsd)}</b> for {sim.airlineName}, {Math.round((bid.priceUsd / Math.max(1, v) - 1) * 100)}% above your value of {formatMoney(v)} when it made the offer. It expires on {formatDate(bid.expiresDay)}.</p>
      <ul>
        <li><b>Accept:</b> the two airlines merge and you run the combined company.{pv && <> {bid.rivalName} brings {pv.aircraft} aircraft, {pv.routes} routes and its base{pv.bases.length === 1 ? "" : "s"} {pv.bases.join(", ")}. The price is paid to your shareholders out of the combined cash, which starts at <b>{formatMoney(pv.cashAfterUsd)}</b> (yours {formatMoney(sim.world.cash)} + theirs {formatMoney(pv.bidderCashUsd)} − the price − {formatMoney(pv.integrationUsd)} to integrate the two airlines).</>} Your campaign grade then counts only what you build from the combined company.</li>
        <li><b>Decline:</b> nothing changes now, but {bid.rivalName} will compete harder in your markets for a year.</li>
      </ul>
      <label className="tk-keep"><input type="checkbox" checked={keepName} onChange={(e) => setKeepName(e.target.checked)} /> Keep the {sim.airlineName} name (otherwise the combined airline is called {bid.rivalName})</label>
      <div className="mk-actions">
        <button className="primary" onClick={() => answer(true)}>Accept and merge</button>
        <button onClick={() => answer(false)}>Decline</button>
        <button onClick={() => { deferred.add(bid.id); setLater(bid.id); useUi.getState().setView("markets"); }}>Decide later (Markets)</button>
      </div>
    </Modal>
  );
}
