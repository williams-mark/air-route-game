import { useMemo, useState } from "react";
import { aircraftTypes } from "@arg/data";
import { refitQuote } from "@arg/sim";
import { CabinDialog } from "../cabin/CabinDialog";
import { usd } from "../cabin/helpers";
import { useToasts } from "../routes/store";
import type { FleetItem } from "../sim/bridge";
import { formatDate } from "../sim/format";
import { bridge, useSim, useSimSelector } from "../sim/useSim";

const ORDER = { maintenance: 0, active: 1, delivery: 2, stored: 3 } as const;
const LABEL = { active: "Active", maintenance: "In check", delivery: "On order", stored: "Stored" } as const;
const CHECK_NAME = { A: "A check", B: "B check", C: "C check", D: "D check" } as const;

function Card({ a, onRefit }: { a: FleetItem; onRefit: (a: FleetItem) => void }) {
  const idle = a.status === "active" && a.routes.length === 0;
  const status = a.status === "maintenance" && a.check ? `${a.refit ? "Cabin refit" : CHECK_NAME[a.check.kind]}, ${a.check.daysRemaining} ${a.check.daysRemaining === 1 ? "day" : "days"} left` : LABEL[a.status];
  return (
    <li className="card">
      <div className="card-top"><strong>{a.tail}</strong><span className={`status st-${a.status}`}>{idle ? "Idle" : LABEL[a.status]}</span></div>
      <div className="card-sub">{a.typeName} {"·"} {a.seats} seats</div>
      <dl className="mini">
        {a.status === "delivery" ? (
          <>
            <dt>Delivery</dt><dd>{a.deliveryDay !== undefined ? formatDate(a.deliveryDay) : "TBC"}</dd>
            <dt>Order</dt><dd>{a.orderId ?? "–"}</dd>
          </>
        ) : (
          <>
            <dt>Status</dt><dd>{idle ? "Spare, not scheduled" : status}</dd>
            <dt>Age</dt><dd>{a.ageYears < 0.1 ? "New" : `${a.ageYears.toFixed(1)} yr`}</dd>
            <dt>Flying</dt><dd>{a.routes.length ? a.routes.join(", ") : "–"}</dd>
            {a.nextCheck && <><dt>Next check</dt><dd>{a.nextCheck.kind} in {a.nextCheck.inDays < 60 ? `${a.nextCheck.inDays} days` : `${Math.round(a.nextCheck.inDays / 30.4)} months`}</dd></>}
          </>
        )}
      </dl>
      {(a.status === "active" || a.status === "stored") && a.layout && (
        <button type="button" className="card-action" onClick={() => onRefit(a)} aria-label={`Refit cabin of ${a.tail}`}>Refit cabin{"…"}</button>
      )}
    </li>
  );
}

export default function FleetView() {
  const fleet = useSimSelector((s) => s.fleet);
  const { day, cash } = useSim();
  const push = useToasts((s) => s.push);
  const [refitting, setRefitting] = useState<FleetItem | null>(null);
  const refitType = refitting ? aircraftTypes.find((t) => t.id === refitting.typeId) : undefined;
  const sorted = useMemo(() => [...fleet].sort((x, y) => ORDER[x.status] - ORDER[y.status] || x.typeId.localeCompare(y.typeId) || x.tail.localeCompare(y.tail)), [fleet]);
  const n = (st: FleetItem["status"]) => fleet.filter((a) => a.status === st).length;
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of fleet) if (a.status !== "delivery") m.set(a.typeId, (m.get(a.typeId) ?? 0) + 1);
    return [...m].map(([t, c]) => `${c} ${t}`).join(", ");
  }, [fleet]);
  if (fleet.length === 0) {
    return (
      <div className="page">
        <header className="page-head"><h1>Fleet</h1><p>Your aircraft.</p></header>
        <div className="empty-state"><h2>No aircraft</h2><p>Order aircraft from Orders / Offers. They appear here as soon as they are ordered, and fly once delivered.</p></div>
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-head">
        <h1>Fleet</h1>
        <p>{fleet.length - n("delivery")} in the fleet ({byType}). {n("maintenance")} in check, {n("delivery")} on order.</p>
      </header>
      <ul className="cards">{sorted.map((a) => <Card key={a.id} a={a} onRefit={setRefitting} />)}</ul>
      {refitting && refitType && refitting.layout && (
        <CabinDialog
          title={`Refit ${refitting.tail} (${refitType.name})`} type={refitType} initial={refitting.layout} day={day} confirmLabel="Start refit"
          quote={(l) => { const q = refitQuote(refitType, l); return <>Cost {usd(q.costUsd)}, out of service {q.downtimeDays} days.</>; }}
          blocker={(l) => (refitQuote(refitType, l).costUsd > cash ? "Not enough cash for this refit." : null)}
          onClose={() => setRefitting(null)}
          onConfirm={(l) => {
            const res = bridge.dispatch({ kind: "refitAircraft", aircraftId: refitting.id, layout: l });
            if (res && !res.ok) push("alert", res.error.message);
            else push("good", `${refitting.tail} is in the hangar for its cabin refit.`);
            setRefitting(null);
          }}
        />
      )}
    </div>
  );
}
