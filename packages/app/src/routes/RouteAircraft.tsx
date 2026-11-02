import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "@arg/contracts";
import { aircraftTypes, airportById } from "@arg/data";
import { dayToDate } from "@arg/sim";
import { AircraftPicker, type OwnedCount } from "../aircraft/AircraftPicker";
import { routeBlock, typicalSeats } from "../aircraft/availability";
import { usePickerMemory } from "../aircraft/memory";
import { bridge, useSim } from "../sim/useSim";
import { useUi } from "../store";
import { IconAlert } from "../shell/icons";
import { pct, usdSigned } from "./fmt";
import { projectRoute, routeName } from "./helpers";
import { useSwapRequest, useToasts } from "./store";

/** Fleet counts by type: owned = in the fleet (not on order or stored), free = owned and flying no route. */
export function ownedByType(fleet: ReadonlyArray<{ typeId: string; status: string; routes: string[] }>): { owned: Map<string, OwnedCount>; onOrder: Map<string, number> } {
  const owned = new Map<string, OwnedCount>();
  const onOrder = new Map<string, number>();
  for (const a of fleet) {
    if (a.status === "delivery") { onOrder.set(a.typeId, (onOrder.get(a.typeId) ?? 0) + 1); continue; }
    if (a.status === "stored") continue;
    const c = owned.get(a.typeId) ?? { total: 0, free: 0 };
    c.total++; if (a.routes.length === 0) c.free++;
    owned.set(a.typeId, c);
  }
  return { owned, onOrder };
}

/** "Aircraft" section of the route inspector: current type, who flies it, and a guided swap of the route's typeId. */
export function RouteAircraft({ route }: { route: Route }) {
  const { day, fleet } = useSim();
  const push = useToasts((s) => s.push);
  const setView = useUi((s) => s.setView);
  const swap = useSwapRequest();
  const [changing, setChanging] = useState(false);
  const [newId, setNewId] = useState(route.typeId);
  const secRef = useRef<HTMLElement>(null);
  const year = dayToDate(day).year;
  const wkDay = Math.floor(day / 7) * 7;
  const a = airportById.get(route.origin), b = airportById.get(route.destination);
  const name = routeName(route);
  const type = aircraftTypes.find((t) => t.id === route.typeId);
  const flying = fleet.filter((f) => f.routes.includes(name));
  const { owned, onOrder } = useMemo(() => ownedByType(fleet), [fleet]);

  useEffect(() => {
    if (swap.routeId === route.id) { setChanging(true); setNewId(route.typeId); swap.clear(); setTimeout(() => secRef.current?.scrollIntoView({ block: "center" }), 0); }
  }, [swap.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNewId(route.typeId); }, [route.typeId]);

  const nextType = aircraftTypes.find((t) => t.id === newId);
  const cur = useMemo(() => projectRoute(route, wkDay)?.evaluation, [route, wkDay]);
  const proj = useMemo(() => (nextType ? projectRoute({ ...route, typeId: nextType.id }, wkDay)?.evaluation : undefined), [route, nextType, wkDay]);
  const changed = newId !== route.typeId;
  const own = owned.get(newId);
  const ordered = onOrder.get(newId) ?? 0;
  const none = changed && (!own || own.total === 0);
  const sub = fleet.find((f) => f.status !== "delivery" && f.status !== "stored" && f.typeId !== newId);

  const apply = () => {
    const res = bridge.dispatch({ kind: "updateRoute", id: route.id, patch: { typeId: newId } });
    if (res && !res.ok) { push("alert", res.error.message); return; }
    push("good", `${name} now uses ${nextType?.name ?? newId}.`);
    setChanging(false);
  };
  const orderIt = () => { usePickerMemory.getState().remember("order", newId); setView("orders"); };

  return (
    <section aria-labelledby="rp-ac" className="rp-sec" ref={secRef} id="rp-aircraft">
      <h3 id="rp-ac">Aircraft</h3>
      <dl className="mini rp-dl">
        <dt>Type</dt><dd>{type?.name ?? route.typeId}{type ? `, ${typicalSeats(type)} seats` : ""}</dd>
        <dt>Flown by</dt><dd>{flying.length === 0 ? "No aircraft assigned right now" : flying.slice(0, 6).map((f) => f.tail).join(", ") + (flying.length > 6 ? ` and ${flying.length - 6} more` : "")}</dd>
        <dt>You own</dt><dd>{owned.get(route.typeId) ? `${owned.get(route.typeId)!.total} ${route.typeId} (${owned.get(route.typeId)!.free} free)` : `None${onOrder.get(route.typeId) ? `, ${onOrder.get(route.typeId)} on order` : ""}`}</dd>
      </dl>
      {!changing ? (
        <div className="rp-actions"><button type="button" onClick={() => { setNewId(route.typeId); setChanging(true); }}>Change aircraft type</button></div>
      ) : (
        <div className="rp-acswap">
          <AircraftPicker label="New aircraft type" value={newId} onChange={setNewId} year={year} types={aircraftTypes} hideBlocked defaultOpen={!changed}
            block={(t) => (a && b ? routeBlock(t, a, b, year) : "Unknown airport")} owned={owned} memoryKey="swap" />
          {changed && nextType && (
            <>
              <div className="rp-acswap-cmp" aria-live="polite">
                <div /><div className="k">Now</div><div className="k">With {nextType.id}</div>
                <div className="k">Profit / week</div><div>{cur ? usdSigned(cur.profit) : "–"}</div>
                <div className={proj ? (proj.profit >= (cur?.profit ?? 0) ? "pos" : "neg") : ""}>{proj ? usdSigned(proj.profit) : "–"}</div>
                <div className="k">Load factor</div><div>{cur ? pct(cur.loadFactor) : "–"}</div><div>{proj ? pct(proj.loadFactor) : "–"}</div>
                <div className="k">Seats / flight</div><div>{cur ? cur.seatsPerFlight : "–"}</div><div>{proj ? proj.seatsPerFlight : "–"}</div>
                <div className="k">Aircraft needed</div><div>{cur ? cur.aircraftEquivalent.toFixed(1) : "–"}</div><div>{proj ? proj.aircraftEquivalent.toFixed(1) : "–"}</div>
              </div>
              <p className="rp-note">At {route.weeklyFrequency} per week, projected from the route model.
                {own ? ` You own ${own.total} ${newId}, ${own.free} free (${own.total - own.free} assigned).` : ""}</p>
              {none && (
                <div className="rp-alert" role="alert"><IconAlert size={16} /><div>
                  <b>No {nextType.id} in your fleet</b>
                  <div>{ordered > 0 ? `${ordered} on order, but none delivered yet. ` : ""}The scheduler will substitute {sub ? `another aircraft such as your ${sub.typeId}` : "whatever it can find"} until you have one: order some or choose a type you own.</div>
                  <button type="button" className="link-btn" onClick={orderIt}>Order {nextType.name}{"…"}</button>
                </div></div>
              )}
              {proj && !proj.feasible && <p className="rp-err" role="alert">{proj.infeasibleReasons.join("; ")}</p>}
            </>
          )}
          <div className="rp-actions">
            <button type="button" className="primary" disabled={!changed || !proj?.feasible} onClick={apply}>Apply {changed ? nextType?.id : "change"}</button>
            <button type="button" onClick={() => { setChanging(false); setNewId(route.typeId); }}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
