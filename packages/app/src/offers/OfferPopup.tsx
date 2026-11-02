import { useSim } from "../sim/useSim";
import { formatMoney } from "../sim/format";
import { useUi } from "../store";
import { closesIn, KIND_BADGE } from "./format";
import { useOffersUi } from "./store";
import "./offers.css";

/** Small card for the newest offer the player has not looked at. Never modal; "Decide later" just hides it (the badge stays). */
export function OfferPopup() {
  const { offers, day } = useSim();
  const seen = useOffersUi((s) => s.seen);
  const markSeen = useOffersUi((s) => s.markSeen);
  const setTab = useOffersUi((s) => s.setTab);
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const fresh = offers.filter((o) => !seen.includes(o.id));
  const o = fresh[fresh.length - 1];
  if (!o) return null;
  const open = () => { markSeen(fresh.map((f) => f.id)); setTab("offers"); setView("orders"); };
  return (
    <section className={`offer-popup ${view === "map" ? "" : "compact"}`} role="group" aria-label="New offer">
      <div className="offer-popup-top">
        <span className={`offer-badge offer-badge-${o.kind}`}>{KIND_BADGE[o.kind]}</span>
        <span className="offer-expiry">{closesIn(o, day)}</span>
      </div>
      <strong className="offer-popup-title">{o.quantity} x {o.typeName}</strong>
      <span className="offer-popup-sub">{formatMoney(o.unitPriceUsd)} each, {Math.round(o.discount * 100)}% {o.kind === "used" ? "below new" : "off list"}{fresh.length > 1 ? `. ${fresh.length - 1} more waiting` : ""}</span>
      <div className="offer-popup-actions">
        <button type="button" className="primary" onClick={open}>View offer</button>
        <button type="button" onClick={() => markSeen(fresh.map((f) => f.id))}>Decide later</button>
      </div>
    </section>
  );
}
