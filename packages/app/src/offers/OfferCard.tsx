import { useState } from "react";
import { bridge } from "../sim/useSim";
import type { OfferItem } from "../sim/bridge";
import { formatMoney } from "../sim/format";
import { useToasts } from "../routes/store";
import { closesIn, daysLeft, KIND_BADGE, versusTypical, windowText } from "./format";
import "./offers.css";

export function OfferCard({ offer, day, cash }: { offer: OfferItem; day: number; cash: number }) {
  const push = useToasts((s) => s.push);
  const [qty, setQty] = useState(Math.min(offer.quantity, offer.kind === "launch" ? 2 : 1));
  const q = Math.max(1, Math.min(offer.quantity, Math.round(qty) || 1));
  const deposit = offer.unitPriceUsd * q * offer.depositFraction;
  const short = deposit > cash;
  const left = daysLeft(offer, day);
  const titleId = `offer-${offer.id}`;
  const typical = versusTypical(offer);

  const accept = () => {
    const res = bridge.dispatch({ kind: "acceptOffer", offerId: offer.id, quantity: q });
    if (res && !res.ok) push("alert", res.error.message);
    else push("good", `Accepted ${q} x ${offer.typeName}. Deposit ${formatMoney(deposit)} paid.`);
  };
  const dismiss = () => { bridge.dispatch({ kind: "dismissOffer", offerId: offer.id }); };

  return (
    <article className={`offer-card offer-${offer.kind}`} aria-labelledby={titleId}>
      <header className="offer-head">
        <span className={`offer-badge offer-badge-${offer.kind}`}>{KIND_BADGE[offer.kind]}</span>
        <h3 id={titleId}>{offer.typeName}</h3>
        <span className={`offer-expiry ${left <= 7 ? "soon" : ""}`}>{closesIn(offer, day)}</span>
      </header>
      <p className="offer-seller">{offer.seller}</p>
      <dl className="offer-facts">
        <div><dt>Available</dt><dd>{offer.quantity} of {offer.initialQuantity}</dd></div>
        <div>
          <dt>Price each</dt>
          <dd className="offer-price"><span>{formatMoney(offer.unitPriceUsd)}</span><s className="offer-list">{formatMoney(offer.listPriceUsd)}</s><strong className="pos">{Math.round(offer.discount * 100)}% off</strong></dd>
        </div>
        <div><dt>Deposit</dt><dd>{Math.round(offer.depositFraction * 100)}% ({formatMoney(offer.unitPriceUsd * offer.depositFraction)} each), credited back at delivery</dd></div>
        <div><dt>Delivery</dt><dd>{windowText(offer, day, q)}{typical && offer.kind !== "used" && offer.kind !== "distressed" ? <span className="offer-sub">{typical}</span> : null}</dd></div>
        {offer.ageYears !== null && (
          <div><dt>Condition</dt><dd>{offer.ageYears.toFixed(1)} years, {(offer.flightHours ?? 0).toLocaleString("en-US")} flight hours</dd></div>
        )}
        <div><dt>Cabin</dt><dd>{offer.seats} seats{offer.layoutNote ? <span className="offer-sub">{offer.layoutNote}</span> : null}</dd></div>
        {offer.delayRisk > 0 && (
          <div><dt>Delay risk</dt><dd className="warn">{Math.round(offer.delayRisk * 100)}% chance of a slip of up to {offer.maxDelayMonths} months</dd></div>
        )}
      </dl>
      <p className="offer-why"><span className="offer-why-k">Why this offer</span> {offer.blurb}</p>
      <footer className="offer-actions">
        <div className="offer-qty" role="group" aria-label={`Quantity for ${offer.typeName}`}>
          <button type="button" aria-label="Fewer" onClick={() => setQty(q - 1)} disabled={q <= 1}>{"−"}</button>
          <input type="number" min={1} max={offer.quantity} value={q} aria-label="Quantity" onChange={(e) => setQty(Number(e.target.value))} />
          <button type="button" aria-label="More" onClick={() => setQty(q + 1)} disabled={q >= offer.quantity}>+</button>
        </div>
        <div className="offer-total" aria-live="polite">
          <span>{formatMoney(offer.unitPriceUsd * q)} total</span>
          <span className={short ? "neg" : "dim"}>{formatMoney(deposit)} deposit now{short ? " (more than your cash)" : ""}</span>
        </div>
        <button type="button" className="primary" onClick={accept} disabled={short}>Accept {q}</button>
        <button type="button" onClick={dismiss}>Dismiss</button>
      </footer>
    </article>
  );
}
