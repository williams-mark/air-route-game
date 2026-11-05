import { Fragment, useMemo, useState } from "react";
import { aircraftTypes, airports } from "@arg/data";
import { homeHubOf, maintenanceEnabled, refitQuote, typeBlockHours } from "@arg/sim";
import { CabinDialog } from "../cabin/CabinDialog";
import { usd } from "../cabin/helpers";
import { useToasts } from "../routes/store";
import { usePickerMemory } from "../aircraft/memory";
import { buildTypeRows, hubOptions, atHub, type HubFilter, type TypeRow } from "../fleet/typeTable";
import type { FleetItem } from "../sim/bridge";
import { bridge, useSim, useSimSelector } from "../sim/useSim";
import { useUi } from "../store";

/** "In check" only exists while the maintenance programme runs; otherwise the hangar holds cabin refits only. */
const label = (st: FleetItem["status"]) => ({ active: "Active", maintenance: maintenanceEnabled() ? "In check" : "Cabin refit", delivery: "On order", stored: "Stored" })[st];
const fmtHours = (h: number) => Math.round(h).toLocaleString("en-US");
/** Cabin refits need a layout and an aircraft that is flying or stored (not on order, not already in the hangar). */
const canRefit = (a: FleetItem) => (a.status === "active" || a.status === "stored") && !!a.layout;

/** Top-level rows: one per aircraft type, with a hub filter and inline expansion to the individual aircraft. */
function TypeTable({ rows, fleet, hub, home, onMove, onOrder, onCabin }: {
  rows: TypeRow[]; fleet: FleetItem[]; hub: HubFilter; home?: string;
  onMove: (aircraftId: string, hubId: string) => void; onOrder: (typeId: string) => void; onCabin: (a: FleetItem) => void;
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
                        <thead><tr><th scope="col">Tail</th><th scope="col">Hub</th><th scope="col">Status</th><th scope="col">Flying</th><th scope="col">Age</th><th scope="col">Move to hub</th><th scope="col">Cabin</th></tr></thead>
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
                              <td>
                                {canRefit(a) ? (
                                  <button type="button" className="card-action" onClick={() => onCabin(a)} aria-label={`Cabin of ${a.tail}`}>Cabin{"…"}</button>
                                ) : (
                                  <button type="button" className="card-action" disabled title="Only active or stored aircraft with a cabin layout can be refitted" aria-label={`Cabin of ${a.tail}`}>Cabin</button>
                                )}
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
  const setView = useUi((s) => s.setView);
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
        <TypeTable rows={typeRows} fleet={fleet} hub={hub} home={home} onMove={move} onOrder={orderType} onCabin={setRefitting} />
      </div>
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
