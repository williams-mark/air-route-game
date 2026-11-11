import { Fragment, useMemo, useState, type ReactNode } from "react";
import { aircraftTypes } from "@arg/data";
import { homeHubOf, maintenanceEnabled, ownedHubsOf, refitQuote, typeBlockHours, type DisposalAction } from "@arg/sim";
import type { CabinLayout } from "@arg/contracts";
import { CabinDialog } from "../cabin/CabinDialog";
import { usd } from "../cabin/helpers";
import { useToasts } from "../routes/store";
import { usePickerMemory } from "../aircraft/memory";
import { buildTypeRows, hubOptions, atHub, type HubFilter, type TypeRow } from "../fleet/typeTable";
import { ownedHubChoices } from "../hubs/hubs";
import { DisposeDialog } from "../fleet/DisposeDialog";
import { disposeOptions, planDisposal } from "../fleet/disposePlan";
import type { FleetItem } from "../sim/bridge";
import { bridge, useSim, useSimSelector } from "../sim/useSim";
import { useUi } from "../store";

/** "In check" only exists while the maintenance programme runs; otherwise the hangar holds cabin refits only. */
const label = (st: FleetItem["status"]) => ({ active: "Active", maintenance: maintenanceEnabled() ? "In check" : "Cabin refit", delivery: "On order", stored: "Stored" })[st];
const fmtHours = (h: number) => Math.round(h).toLocaleString("en-US");
/** Cabin refits need a layout and an aircraft that is flying or stored (not on order, not already in the hangar). */
const canRefit = (a: FleetItem) => (a.status === "active" || a.status === "stored") && !!a.layout;

/** Actions on several selected aircraft (all within the open type). */
function BulkBar({ count, hubs, home, canCabin, cabinHint, sellable, returnable, onMove, onCabin, onDispose, onClear }: {
  count: number; hubs: string[]; home?: string; canCabin: boolean; cabinHint: string | null;
  /** How many of the selected aircraft are owned (can be sold) and leased (can be returned), not counting those that fly routes. */
  sellable: number; returnable: number;
  onMove: (hubId: string) => void; onCabin: () => void; onDispose: (action: DisposalAction) => void; onClear: () => void;
}) {
  const [target, setTarget] = useState<string>(home ?? hubs[0] ?? "");
  return (
    <div className="fleet-bulk" role="group" aria-label="Actions for the selected aircraft">
      <span className="fleet-bulk-count">{count} selected</span>
      <label className="fleet-bulk-label">Move to hub
        <select aria-label="Hub for selected aircraft" value={target} onChange={(e) => setTarget(e.target.value)}>
          {hubs.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => onMove(target)} disabled={!target}>Move selected</button>
      <button type="button" disabled={!canCabin} title={cabinHint ?? undefined} onClick={onCabin}>Cabin change{"…"}</button>
      <button type="button" disabled={sellable === 0} title={sellable === 0 ? "None of the selected aircraft is owned outright and off its routes" : undefined} onClick={() => onDispose("sell")}>Sell{sellable > 0 ? ` ${sellable}` : ""}{"…"}</button>
      <button type="button" disabled={returnable === 0} title={returnable === 0 ? "None of the selected aircraft is leased and off its routes" : undefined} onClick={() => onDispose("return")}>Return{returnable > 0 ? ` ${returnable}` : ""}{"…"}</button>
      <button type="button" className="link-btn" onClick={onClear}>Clear selection</button>
    </div>
  );
}

/** Top-level rows: one per aircraft type, with a hub filter and inline expansion to the individual aircraft. */
function TypeTable({ rows, fleet, hub, home, hubs, openType, onOpen, selected, onToggle, onToggleAll, bulk, onCabin, onMove, onOrder, onDispose }: {
  rows: TypeRow[]; fleet: FleetItem[]; hub: HubFilter; home?: string; hubs: string[];
  openType: string | null; onOpen: (typeId: string | null) => void;
  selected: ReadonlySet<string>; onToggle: (aircraftId: string) => void; onToggleAll: (ids: string[], on: boolean) => void;
  bulk: ReactNode; onCabin: (a: FleetItem) => void; onMove: (aircraftId: string, hubId: string) => void; onOrder: (typeId: string) => void;
  onDispose: (a: FleetItem) => void;
}) {
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
          const expanded = openType === r.typeId;
          const members = fleet.filter((a) => a.typeId === r.typeId && atHub(a, hub, home));
          const allOn = members.length > 0 && members.every((m) => selected.has(m.id));
          return (
            <Fragment key={r.typeId}>
              <tr className={expanded ? "open" : undefined}>
                <th scope="row">
                  <button type="button" className="link-btn fleet-type-toggle" aria-expanded={expanded} aria-controls={`fleet-type-${r.typeId}`}
                    onClick={() => onOpen(expanded ? null : r.typeId)}>
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
                      <>
                        {bulk}
                        <table className="fleet-members" aria-label={`${r.typeName} aircraft`}>
                          <thead><tr>
                            <th scope="col"><input type="checkbox" aria-label={`Select all ${r.typeName} shown`} checked={allOn} onChange={() => onToggleAll(members.map((m) => m.id), !allOn)} /></th>
                            <th scope="col">Tail</th><th scope="col">Hub</th><th scope="col">Status</th><th scope="col">Flying</th><th scope="col">Age</th><th scope="col">Move to hub</th><th scope="col">Cabin</th><th scope="col">Sell / return</th>
                          </tr></thead>
                          <tbody>
                            {members.map((a) => (
                              <tr key={a.id}>
                                <td><input type="checkbox" aria-label={`Select ${a.tail}`} checked={selected.has(a.id)} onChange={() => onToggle(a.id)} /></td>
                                <td>{a.tail}</td>
                                <td>{a.hub ?? "–"}</td>
                                <td>{label(a.status)}</td>
                                <td>{a.routes.length ? a.routes.join(", ") : "–"}</td>
                                <td>{a.ageYears < 0.1 ? "New" : `${a.ageYears.toFixed(1)} yr`}{a.retireYear !== undefined && <span className="hint"> · retires {a.retireYear}</span>}</td>
                                <td>
                                  <select aria-label={`Hub for ${a.tail}`} value={a.hub ?? home ?? ""} disabled={a.status !== "active"}
                                    title={a.status !== "active" ? "Only active aircraft can be based at a hub" : undefined}
                                    onChange={(e) => onMove(a.id, e.target.value)}>
                                    {hubs.map((h) => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                </td>
                                <td>
                                  {canRefit(a) ? (
                                    <button type="button" className="card-action" onClick={() => onCabin(a)} aria-label={`Cabin of ${a.tail}`}>Cabin{"…"}</button>
                                  ) : (
                                    <button type="button" className="card-action" disabled title="Only active or stored aircraft with a cabin layout can be refitted" aria-label={`Cabin of ${a.tail}`}>Cabin</button>
                                  )}
                                </td>
                                <td>
                                  {(() => {
                                    const o = disposeOptions(a);
                                    if (!o) return "–";
                                    const word = o.action === "sell" ? "Sell" : "Return";
                                    return <button type="button" className="card-action" disabled={o.blocker !== null} title={o.blocker ?? (o.action === "sell" ? "Sell this aircraft to a dealer" : "Return this lease early for a termination fee")}
                                      onClick={() => onDispose(a)} aria-label={`${word} ${a.tail}`}>{word}{o.blocker === null ? "…" : ""}</button>;
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
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
  const credit = useSimSelector((s) => s.credit);
  const { day, cash } = useSim();
  const push = useToasts((s) => s.push);
  const [refitting, setRefitting] = useState<FleetItem[] | null>(null);
  const [disposing, setDisposing] = useState<{ items: FleetItem[]; action: DisposalAction } | null>(null);
  const setView = useUi((s) => s.setView);
  const [hub, setHub] = useState<HubFilter>("all");
  const [openType, setOpenType] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const sim = bridge.getSim?.() ?? null;
  const home = sim ? homeHubOf(sim) : undefined;
  // Aircraft can only be based at hubs the player owns; no sim (mock) falls back to the airline's hub.
  const hubs = sim ? ownedHubChoices(ownedHubsOf(sim), home) : ownedHubChoices([bridge.getState().airline.hub], undefined);
  const hubFilterOptions = hubOptions(fleet, home);
  const typeRows = useMemo(
    () => buildTypeRows(fleet, hub, (typeId, h) => (sim ? typeBlockHours(sim, typeId, h === "all" ? undefined : h) : { available: 0, used: 0, free: 0 }), home),
    [fleet, hub, day, home], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const refitType = refitting ? aircraftTypes.find((t) => t.id === refitting[0]?.typeId) : undefined;

  const move = (aircraftId: string, hubId: string) => {
    const ac = fleet.find((a) => a.id === aircraftId);
    const res = bridge.dispatch({ kind: "setAircraftHub", aircraftId, hubId });
    if (res && !res.ok) { push("alert", res.error.message); return; }
    push("good", `${ac?.tail ?? "Aircraft"} now based at ${hubId}.`);
  };
  const moveSelected = (hubId: string) => {
    const ids = [...selected];
    let ok = 0;
    const fails: string[] = [];
    for (const aircraftId of ids) {
      const res = bridge.dispatch({ kind: "setAircraftHub", aircraftId, hubId });
      if (res && !res.ok) fails.push(res.error.message); else ok++;
    }
    setSelected(new Set());
    if (fails.length === 0) push("good", `${ok} aircraft now based at ${hubId}.`);
    else push("alert", `${ok} moved to ${hubId}; ${fails.length} not moved. ${fails[0]}`);
  };
  const refitSelected = (layout: CabinLayout, targets: FleetItem[]) => {
    let ok = 0;
    const fails: string[] = [];
    for (const a of targets) {
      const res = bridge.dispatch({ kind: "refitAircraft", aircraftId: a.id, layout });
      if (res && !res.ok) fails.push(res.error.message); else ok++;
    }
    setSelected(new Set());
    if (fails.length === 0) push("good", targets.length === 1 ? `${targets[0]!.tail} is in the hangar for its cabin refit.` : `${ok} aircraft are in the hangar for their cabin refit.`);
    else push("alert", `${ok} sent to refit; ${fails.length} not. ${fails[0]}`);
  };
  const openDispose = (items: FleetItem[], action: DisposalAction) => { if (sim) setDisposing({ items, action }); };
  const confirmDispose = () => {
    if (!disposing) return;
    const { items, action } = disposing;
    setDisposing(null);
    let ok = 0;
    const fails: string[] = [];
    for (const a of items) {
      const res = bridge.dispatch(action === "sell" ? { kind: "sellAircraft", aircraftId: a.id } : { kind: "returnLease", aircraftId: a.id });
      if (res && !res.ok) fails.push(res.error.message); else ok++;
    }
    setSelected(new Set());
    const verb = action === "sell" ? "Sold" : "Returned";
    if (fails.length === 0) push("good", ok === 1 ? `${verb} ${items[0]!.tail}.` : `${verb} ${ok} aircraft.`);
    else push("alert", `${ok} ${verb.toLowerCase()}; ${fails.length} not. ${fails[0]}`);
  };
  const toggle = (aircraftId: string) => setSelected((s) => { const n = new Set(s); if (n.has(aircraftId)) n.delete(aircraftId); else n.add(aircraftId); return n; });
  const toggleAll = (ids: string[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
  const changeOpen = (typeId: string | null) => { setOpenType(typeId); setSelected(new Set()); };
  const changeHub = (h: string) => { setHub(h); setSelected(new Set()); };
  const orderType = (typeId: string) => { usePickerMemory.getState().remember("order", typeId); setView("orders"); };

  const selList = fleet.filter((a) => selected.has(a.id));
  const sameType = new Set(selList.map((a) => a.typeId)).size === 1;
  const refitable = selList.filter(canRefit);
  const cabinHint = !sameType ? "Cabin change works on one aircraft type at a time." : refitable.length === 0 ? "None of the selected aircraft can be refitted now." : null;
  const bulkOk = (action: DisposalAction) => selList.filter((a) => { const o = disposeOptions(a); return o !== null && o.action === action && o.blocker === null; });
  const bulk = selList.length > 0 ? (
    <BulkBar count={selList.length} hubs={hubs} home={home} canCabin={cabinHint === null} cabinHint={cabinHint}
      sellable={bulkOk("sell").length} returnable={bulkOk("return").length}
      onMove={moveSelected} onCabin={() => setRefitting(refitable)} onDispose={(action) => openDispose(bulkOk(action), action)} onClear={() => setSelected(new Set())} />
  ) : null;

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
        <select id="fleet-hub" value={hub} onChange={(e) => changeHub(e.target.value)}>
          <option value="all">All hubs</option>
          {hubFilterOptions.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
      <div className="fleet-scroll">
        <TypeTable rows={typeRows} fleet={fleet} hub={hub} home={home} hubs={hubs} openType={openType} onOpen={changeOpen}
          selected={selected} onToggle={toggle} onToggleAll={toggleAll} bulk={bulk} onCabin={(a) => setRefitting([a])} onMove={move} onOrder={orderType} onDispose={(a) => openDispose([a], disposeOptions(a)?.action ?? "sell")} />
      </div>
      {disposing && sim && (
        <DisposeDialog plan={planDisposal(sim, disposing.items, disposing.action)} distress={!!credit?.distress}
          onConfirm={confirmDispose} onClose={() => setDisposing(null)} />
      )}
      {refitting && refitType && refitting.length > 0 && refitting[0]!.layout && (
        <CabinDialog
          title={refitting.length === 1 ? `Refit ${refitting[0]!.tail} (${refitType.name})` : `Refit ${refitting.length} ${refitType.name}`}
          type={refitType} initial={refitting[0]!.layout} day={day} confirmLabel={refitting.length === 1 ? "Start refit" : `Refit ${refitting.length} aircraft`} requireChange
          quote={(l) => {
            const qs = refitting.map(() => refitQuote(refitType, l));
            const cost = qs.reduce((s, q) => s + q.costUsd, 0);
            const days = Math.max(...qs.map((q) => q.downtimeDays));
            return refitting.length === 1
              ? <>Cost {usd(cost)}, out of service {days} days.</>
              : <>Cost {usd(cost)} for {refitting.length} aircraft, out of service up to {days} days each.</>;
          }}
          blocker={(l) => {
            const total = refitting.reduce((s) => s + refitQuote(refitType, l).costUsd, 0);
            return total > cash ? "Not enough cash for this refit." : null;
          }}
          onClose={() => setRefitting(null)}
          onConfirm={(l) => { const targets = refitting; setRefitting(null); refitSelected(l, targets); }}
        />
      )}
    </div>
  );
}
