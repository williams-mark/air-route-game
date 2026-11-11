import { useMemo, useState } from "react";
import type { Id } from "@arg/contracts";
import { aircraftTypes, airportById } from "@arg/data";
import { COMMAND_PARAMS, ownedHubsOf, typeCanServe, weeklyCapacityHours } from "@arg/sim";
import { bridge, useSim } from "../sim/useSim";
import { usd } from "./fmt";
import { hubCallout, moveCandidates, type HubCalloutState, type MoveCandidate } from "./hubMove";
import { useToasts } from "./store";

/**
 * Explains why the origin cannot fly the draft (not a hub, no aircraft of the type based there, too few free block hours)
 * and fixes it in place: unlock the hub, or rebase idle aircraft to it. Uses the existing unlockHub / setAircraftHub commands.
 */
export function HubMoveCallout({ originId, destinationId, typeId, available, needed, free }: { originId: Id; destinationId: Id; typeId: Id; available: number; needed: number; free: number }) {
  const { fleet, cash } = useSim();
  const push = useToasts((s) => s.push);
  const sim = bridge.getSim?.() ?? null;
  const originOwned = sim ? ownedHubsOf(sim).includes(originId) : true;
  const state: HubCalloutState = sim ? hubCallout({ originOwned, typeId, available, needed, free }) : { kind: "none" };
  const [picked, setPicked] = useState<ReadonlySet<Id>>(new Set());
  const capacity = (t: Id) => { const ty = aircraftTypes.find((x) => x.id === t); return ty ? weeklyCapacityHours(ty) : 0; };
  // Range and runway for the drafted pair, as the sim's own scheduler check: types that cannot fly it are not offered as movable.
  const pairA = airportById.get(originId), pairB = airportById.get(destinationId);
  const canServe = (t: Id) => {
    const ty = aircraftTypes.find((x) => x.id === t);
    return !!ty && !!pairA && !!pairB && typeCanServe(pairA, pairB, ty);
  };
  const rows = useMemo(
    () => (state.kind === "none_based" || state.kind === "short" ? moveCandidates(fleet, originId, capacity, typeId, canServe) : []),
    [fleet, originId, destinationId, typeId, state.kind], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (state.kind === "none") return null;
  const code = originId;

  if (state.kind === "unlock") {
    const cost = COMMAND_PARAMS.hubUnlockUsd;
    const poor = cash < cost;
    const unlock = () => {
      const res = bridge.dispatch({ kind: "unlockHub", airportId: originId });
      if (res && !res.ok) push("alert", res.error.message); else push("good", `${originId} is now one of your hubs.`);
    };
    return (
      <div className="rc-callout" role="group" aria-label={`${code} is not a hub`}>
        <p><b>{code} is not one of your hubs.</b> Aircraft can only fly routes from a hub, so unlock it first.</p>
        <button type="button" className="primary" disabled={poor} title={poor ? "Not enough cash" : undefined} onClick={unlock}>Unlock hub for {usd(cost)}</button>
      </div>
    );
  }

  const typeName = aircraftTypes.find((t) => t.id === state.typeId)?.name ?? state.typeId;
  const why = state.kind === "none_based"
    ? <>No <b>{typeName}</b> is based at {code}, so the route has no block hours to fly with.</>
    : <>{code} is <b>{state.shortBy.toFixed(1)} block h/wk</b> short for this frequency on the {typeName}.</>;
  const eligible = rows.filter((r) => r.eligible);
  const unavailable = rows.filter((r) => !r.eligible);
  const chosen = eligible.filter((r) => picked.has(r.id));
  const addHours = chosen.reduce((s, r) => s + r.freeHours, 0);
  const toggle = (id: Id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const confirm = () => {
    let ok = 0;
    const fails: string[] = [];
    for (const r of chosen) {
      const res = bridge.dispatch({ kind: "setAircraftHub", aircraftId: r.id, hubId: originId });
      if (res && !res.ok) fails.push(res.error.message); else ok++;
    }
    setPicked(new Set());
    if (fails.length === 0) push("good", `${ok} aircraft now based at ${originId}.`);
    else push("alert", `${ok} moved to ${originId}; ${fails.length} not moved. ${fails[0]}`);
  };
  return (
    <div className="rc-callout" role="group" aria-label={`Move aircraft to ${code}`}>
      <p>{why} Move aircraft to {code}; idle aircraft only.</p>
      {rows.length === 0 ? <p className="hint">You have no aircraft at other hubs to move.</p> : (
        <>
          {eligible.length === 0 && <p className="hint">No idle aircraft that can fly {code} to {destinationId} is at another hub.</p>}
          {eligible.length > 0 && (
            <ul className="rc-move-list">
              {eligible.map((r) => <MoveRow key={r.id} r={r} checked={picked.has(r.id)} onToggle={() => toggle(r.id)} />)}
            </ul>
          )}
          {unavailable.length > 0 && (
            <details className="rc-move-more">
              <summary>Show {unavailable.length} unavailable aircraft</summary>
              <ul className="rc-move-list">
                {unavailable.map((r) => <MoveRow key={r.id} r={r} checked={false} onToggle={() => undefined} />)}
              </ul>
            </details>
          )}
        </>
      )}
      <button type="button" className="primary" disabled={chosen.length === 0} title={chosen.length === 0 ? "Select at least one aircraft" : undefined} onClick={confirm}>
        {chosen.length === 0 ? `Move aircraft to ${code}` : `Move ${chosen.length} aircraft to ${code} (+${addHours.toFixed(0)} h/wk)`}
      </button>
    </div>
  );
}

/** One aircraft in the move list: a checkbox when it can move, the reason when it cannot. */
function MoveRow({ r, checked, onToggle }: { r: MoveCandidate; checked: boolean; onToggle: () => void }) {
  return (
    <li className={r.eligible ? undefined : "off"}>
      <label title={r.reason}>
        <input type="checkbox" aria-label={`Move ${r.tail}`} checked={checked} disabled={!r.eligible} onChange={onToggle} />
        <span className="rc-move-main"><b>{r.tail}</b> {r.typeName}</span>
        <span className="rc-move-meta">{r.ageYears < 0.1 ? "New" : `${r.ageYears.toFixed(1)} yr`} · at {r.hub ?? "–"} · {r.eligible ? `+${r.freeHours.toFixed(0)} h/wk free` : "can't move"}</span>
        {r.reason && <span className="rc-move-why">{r.reason}</span>}
      </label>
    </li>
  );
}
