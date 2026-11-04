import { Fragment, useMemo, useState } from "react";
import { aircraftTypes, airports } from "@arg/data";
import { homeHubOf, maintenanceEnabled, refitQuote, typeBlockHours } from "@arg/sim";
import { CabinDialog } from "../cabin/CabinDialog";
import { usd } from "../cabin/helpers";
import { useToasts } from "../routes/store";
import { usePickerMemory } from "../aircraft/memory";
import { buildTypeRows, hubOptions, atHub, type HubFilter, type TypeRow } from "../fleet/typeTable";
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
            <dt>Hub</dt><dd>{a.hub ?? "–"}</dd>
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


const fmtHours = (h: number) => Math.round(h).toLocaleString("en-US");

/** Top-level rows: one per aircraft type, with a hub filter and inline expansion to the individual aircraft. */
function TypeTable({ rows, fleet, hub, home, onMove, onOrder }: {
  rows: TypeRow[]; fleet: FleetItem[]; hub: HubFilter; home?: string;
  onMove: (aircraftId: string, hubId: string) => void; onOrder: (typeId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // Any airport can be a hub: the move select offers every airport in the data, home hub first.
  const moveTo = useMemo(() => [...airports.map((a) => a.id)].sort((x, y) => (x === home ? -1 : y === home ? 1 : x.localeCompare(y, "en"))), [home]);
  return (
    <table className="fleet-types" aria-label="Aircraft types">
      <thead>
        <tr>
          <th scope="col">Type</th><th scope="col">In service</th><th scope="col">On order</th>
          <th scope="col">Free block h / wk</th><th scope="col">Used / available h / wk</th><th scope="col">Order</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const expanded = open === r.typeId;
          const members = fleet.filter((a) => a.typeId === r.typeId && atHub(a, hub, home));
          return (
            <Fragment key={r.typeId}>
              <tr className={expanded ? "open" : undefined}>
                <th scope="row">
                  <button type="button" className="link-btn fleet-type-toggle" aria-expanded={expanded} aria-controls={`fleet-type-${r.typeId}`}
                    onClick={() => setOpen(expanded ? null : r.typeId)}>
                    {expanded ? "▾" : "▸"} {r.typeName}
                  </button>
                </th>
                <td>{r.inService}</td>
                <td>{r.onOrder}</td>
                <td className={r.freeHours < 0 ? "neg" : undefined}>{fmtHours(r.freeHours)}</td>
                <td>{fmtHours(r.usedHours)} / {fmtHours(r.availableHours)}</td>
                <td><button type="button" className="card-action" onClick={() => onOrder(r.typeId)} aria-label={`Order ${r.typeName}`}>Order</button></td>
              </tr>
              {expanded && (
                <tr id={`fleet-type-${r.typeId}`}>
                  <td colSpan={6}>
                    {members.length === 0 ? (
                      <p className="hint">No {r.typeName} at {hub === "all" ? "any hub" : hub} yet.</p>
                    ) : (
                      <table className="fleet-members" aria-label={`${r.typeName} aircraft`}>
                        <thead><tr><th scope="col">Tail</th><th scope="col">Hub</th><th scope="col">Status</th><th scope="col">Flying</th><th scope="col">Age</th><th scope="col">Move to hub</th></tr></thead>
                        <tbody>
                          {members.map((a) => (
                            <tr key={a.id}>
                              <td>{a.tail}</td>
                              <td>{a.hub ?? "–"}</td>
                              <td>{label(a.status)}</td>
                              <td>{a.routes.length ? a.routes.join(", ") : "–"}</td>
                              <td>{a.ageYears < 0.1 ? "New" : `${a.ageYears.toFixed(1)} yr`}</td>
                              <td>
                                <select aria-label={`Hub for ${a.tail}`} value={a.hub ?? home ?? ""} disabled={a.status !== "active"}
                                  title={a.status !== "active" ? "Only active aircraft can be based at a hub" : undefined}
                                  onChange={(e) => onMove(a.id, e.target.value)}>
                                  {moveTo.map((h) => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
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
  const setView = useUi((s) => s.setView);
  const sorted = useMemo(() => sortFleet(fleet, sortKey, sortDir), [fleet, sortKey, sortDir]);
  const [hub, setHub] = useState<HubFilter>("all");
  const sim = bridge.getSim?.() ?? null;
  const home = sim ? homeHubOf(sim) : undefined;
  const hubs = hubOptions(fleet, home);
  const typeRows = useMemo(
    () => buildTypeRows(fleet, hub, (typeId, h) => (sim ? typeBlockHours(sim, typeId, h === "all" ? undefined : h) : { available: 0, used: 0, free: 0 }), home),
    [fleet, hub, day, home], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const move = (aircraftId: string, hubId: string) => {
    const ac = fleet.find((a) => a.id === aircraftId);
    const res = bridge.dispatch({ kind: "setAircraftHub", aircraftId, hubId });
    if (res && !res.ok) { push("alert", res.error.message); return; }
    push("good", `${ac?.tail ?? "Aircraft"} now based at ${hubId}.`);
  };
  const orderType = (typeId: string) => { usePickerMemory.getState().remember("order", typeId); setView("orders"); };
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
      <div className="fleet-hub-filter">
        <label htmlFor="fleet-hub">Hub</label>
        <select id="fleet-hub" value={hub} onChange={(e) => setHub(e.target.value)}>
          <option value="all">All hubs</option>
          {hubs.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
      <div className="fleet-scroll">
        <TypeTable rows={typeRows} fleet={fleet} hub={hub} home={home} onMove={move} onOrder={orderType} />
      </div>
      <h2 className="fleet-aircraft-head">Aircraft</h2>
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
        {sorted.filter((a) => atHub(a, hub, home)).map((a, i, list) => {
          const g = groupLabel(a, sortKey);
          const head = g !== null && (i === 0 || groupLabel(list[i - 1]!, sortKey) !== g);
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
