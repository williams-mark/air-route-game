import { useState } from "react";
import { marketOf, playerValuation } from "@arg/sim";
import { bridge, useSim } from "../sim/useSim";
import { useUi } from "../store";
import { useToasts } from "../routes/store";
import { formatDate, formatMoney } from "../sim/format";
import { Modal } from "../shell/Modal";

/**
 * A competitor's offer for the player's airline: the game pauses and this card asks for an answer (accept, decline, or decide later on
 * the Markets screen before it expires). "Later" hides it until the next offer.
 */
export function TakeoverPrompt() {
  useSim();
  const sim = bridge.getSim?.() ?? null;
  const [later, setLater] = useState<string | null>(null);
  const push = useToasts((s) => s.push);
  const bid = sim ? marketOf(sim).incoming[0] : undefined;
  if (!sim || !bid || later === bid.id) return null;
  const v = playerValuation(sim).valueUsd;
  const answer = (accept: boolean) => {
    const r = bridge.dispatch({ kind: "respondToBid", bidId: bid.id, accept });
    if (r && !r.ok) push("alert", r.error.message); else push(accept ? "good" : "info", r?.message ?? "Done.");
  };
  return (
    <Modal label="Takeover offer" className="dialog takeover-card" initialFocus="h2" onClose={() => setLater(bid.id)}>
      <h2 tabIndex={-1}>Takeover offer from {bid.rivalName}</h2>
      <p><b>{bid.rivalName}</b> offers <b>{formatMoney(bid.priceUsd)}</b> for {sim.airlineName}, {Math.round((bid.priceUsd / Math.max(1, v) - 1) * 100)}% above today's value of {formatMoney(v)}. It expires on {formatDate(bid.expiresDay)}.</p>
      <ul>
        <li><b>Accept:</b> the two airlines merge and you run the combined company under the {bid.rivalName} name, with its aircraft, routes, bases and cash. The price is paid to your shareholders (shown on Markets).</li>
        <li><b>Decline:</b> nothing changes now, but {bid.rivalName} will compete harder in your markets for a year.</li>
      </ul>
      <div className="mk-actions">
        <button className="primary" onClick={() => answer(true)}>Accept and merge</button>
        <button onClick={() => answer(false)}>Decline</button>
        <button onClick={() => { setLater(bid.id); useUi.getState().setView("markets"); }}>Decide later (Markets)</button>
      </div>
    </Modal>
  );
}
