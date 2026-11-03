import { Fragment, useMemo, useState } from "react";
import { aircraftTypes } from "@arg/data";
import { maintenanceEnabled, refitQuote } from "@arg/sim";
import { CabinDialog } from "../cabin/CabinDialog";
import { usd } from "../cabin/helpers";
import { useToasts } from "../routes/store";
import type { FleetItem } from "../sim/bridge";
import { formatDate } from "../sim/format";
import { bridge, useSim, useSimSelector } from "../sim/useSim";
import { useUi } from "../store";
import { FLEET_SORT_KEYS, groupLabel, sortFleet } from "./fleetSort";

/** "In check" only exists while the maintenance programme runs; otherwise the hangar holds cabin refits only. */
const label = (st: FleetItem["status"]) => ({ active: "Active", maintenance: maintenanceEnabled() ? "In check" : "Cabin refit", delivery: "On order", stored: "Stored" })[st];
const CHECK_NAME = { A: "A check", B: "B check", C: "C check", D: "D check" } as const;

function Card({ a, onRefit }: { a: FleetItem; onRefit: (a: FleetItem) => void }) {
  const idle = a.status === "active" && a.routes.length === 0;
  const status = a.status === "maintenance" && a.check ? `${a.refit ? "Cabin refit" : CHECK_NAME[a.check.kind]}, ${a.check.daysRemaining} ${a.check.daysRemaining === 1 ? "day" : "days"} left` : label(a.status);
  return (
    <li className="card">
      <div className="card-top"><strong>{a.tail}</strong><span className={`status st-${a.status}`}>{idle ? "Idle" : label(a.status)}</span></div>
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
  const { key: sortKey, dir: sortDir } = useUi((s) => s.fleetSort);
  const setFleetSort = useUi((s) => s.setFleetSort);
  const sorted = useMemo(() => sortFleet(fleet, sortKey, sortDir), [fleet, sortKey, sortDir]);
  const sortLabel = FLEET_SORT_KEYS.find((k) => k.key === sortKey)!.label;
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
        <p>{fleet.length - n("delivery")} in the fleet ({byType}). {n("maintenance")} {maintenanceEnabled() ? "in check" : "in cabin refit"}, {n("delivery")} on order.</p>
      </header>
      <div className="sort-bar" role="group" aria-label="Sort fleet">
        <span className="sort-label" id="fleet-sort-label">Sort by</span>
        {FLEET_SORT_KEYS.map((k) => (
          <button key={k.key} type="button" className={`sort-btn${sortKey === k.key ? " on" : ""}`} aria-pressed={sortKey === k.key}
            onClick={() => setFleetSort(k.key, sortKey === k.key ? (sortDir === "asc" ? "desc" : "asc") : "asc")}>
            {k.label}{sortKey === k.key && <span aria-hidden="true"> {sortDir === "asc" ? "\u2191" : "\u2193"}</span>}
          </button>
        ))}
        <button type="button" className="sort-btn" onClick={() => setFleetSort(sortKey, sortDir === "asc" ? "desc" : "asc")} aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}. Switch.`}>
          {sortDir === "asc" ? "Ascending" : "Descending"}
        </button>
        <span className="sr-only" role="status">Sorted by {sortLabel}, {sortDir === "asc" ? "ascending" : "descending"}</span>
      </div>
      <ul className="cards">
        {sorted.map((a, i) => {
          const g = groupLabel(a, sortKey);
          const head = g !== null && (i === 0 || groupLabel(sorted[i - 1]!, sortKey) !== g);
          return (
            <Fragment key={a.id}>
              {head && <li className="group-head" role="presentation">{g}</li>}
              <Card a={a} onRefit={setRefitting} />
            </Fragment>
          );
        })}
      </ul>
      {refitting && refitType && refitting.layout && (
        <CabinDialog
          title={`Refit ${refitting.tail} (${refitType.name})`} type={refitType} initial={refitting.layout} day={day} confirmLabel="Start refit" requireChange
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
