import { useSim } from "../sim/useSim";
import { OfferCard } from "./OfferCard";
import { useOffersUi } from "./store";
import { useEffect } from "react";

const ORDER = { launch: 0, endOfLife: 1, distressed: 2, used: 3 } as const;

export function OffersPanel() {
  const { offers, day, cash } = useSim();
  const markSeen = useOffersUi((s) => s.markSeen);
  useEffect(() => { markSeen(offers.map((o) => o.id)); }, [offers, markSeen]);
  const sorted = [...offers].sort((a, b) => a.expiresDay - b.expiresDay || ORDER[a.kind] - ORDER[b.kind]);
  if (sorted.length === 0) {
    return (
      <section className="panel-box">
        <h2>Offers</h2>
        <p className="foot-note">No open offers. Manufacturers and sellers make a deal every month or so; the top bar shows a badge when one arrives.</p>
      </section>
    );
  }
  return (
    <div className="offer-list" role="list" aria-label="Open offers">
      {sorted.map((o) => <div role="listitem" key={o.id}><OfferCard offer={o} day={day} cash={cash} /></div>)}
    </div>
  );
}
