// Test-only helper: adds an active aircraft of a type based at a hub (the hub-pool checks need one to open a route).
import type { Aircraft, Id } from "@arg/contracts";
import { defaultLayout } from "../fleet/layout";
import type { SimState } from "../state";

export function withBasedAircraft(state: SimState, typeId: Id, hubId: Id): SimState {
  const type = state.aircraftTypes.find((t) => t.id === typeId);
  if (!type) throw new Error(`withBasedAircraft: unknown type ${typeId}`);
  const id = `hub-${hubId}-${typeId}`;
  const ac: Aircraft = {
    id, typeId, tailNumber: `N${id}`, layout: defaultLayout(type), status: "active", ageDays: 1000,
    hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 }, hubId,
  };
  const donor = Object.values(state.fleetMeta)[0]!;
  const meta = { ...donor, daysSince: { ...donor.daysSince }, intervals: { ...donor.intervals }, maintenance: null, deliveryDay: null, orderId: null, deferredDays: 0 };
  return { ...state, world: { ...state.world, fleet: [...state.world.fleet, ac] }, fleetMeta: { ...state.fleetMeta, [id]: meta } };
}
