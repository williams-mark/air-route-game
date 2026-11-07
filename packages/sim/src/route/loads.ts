import type { CabinClass } from "@arg/contracts";
import type { RouteEvaluation } from "../finance/ledger";
import { CABIN_CLASSES } from "../cabin/rules";

/** One cabin's weekly load. `loadFactor` is null only when the cabin has no seats on the route (show "no cabin"); an empty cabin with seats is 0. */
export interface CabinLoadFactor {
  cls: CabinClass;
  seatsPerWeek: number;
  passengersPerWeek: number;
  loadFactor: number | null;
}

/**
 * Connecting passengers as a share of all passengers on a route. `oneWay` is the weekly through passengers per direction (the
 * figure `RouteConnecting` reports); both directions are counted, so the share is 2 x oneWay / passengers, clamped to 0..1.
 * 0 when there are no passengers or no connecting passengers.
 */
export function connectingShare(oneWay: number, passengersPerWeek: number): number {
  if (!(passengersPerWeek > 0) || !(oneWay > 0)) return 0;
  return Math.min(1, (2 * oneWay) / passengersPerWeek);
}

/**
 * Load factor for each cabin class, in F, J, W, Y order. Every class the route flies appears, including empty ones (0%). Classes
 * with no seats on the route have `seatsPerWeek` 0 and `loadFactor` null. Routes without per-cabin figures (older saves) show all
 * classes as null.
 */
export function loadByCabin(e: Pick<RouteEvaluation, "cabinLoads">): Record<CabinClass, CabinLoadFactor> {
  const out = {} as Record<CabinClass, CabinLoadFactor>;
  for (const cls of ["F", "J", "W", "Y"] as CabinClass[]) {
    const c = e.cabinLoads?.find((x) => x.cls === cls);
    const seats = c?.seatsPerWeek ?? 0;
    const pax = c?.passengersPerWeek ?? 0;
    out[cls] = { cls, seatsPerWeek: seats, passengersPerWeek: pax, loadFactor: seats > 0 ? Math.min(1, pax / seats) : null };
  }
  return out;
}

/** Cabin classes a route flies, in F, J, W, Y order. */
export function cabinsFlown(e: Pick<RouteEvaluation, "cabinLoads">): CabinClass[] {
  return CABIN_CLASSES.filter((cls) => (e.cabinLoads?.find((c) => c.cls === cls)?.seatsPerWeek ?? 0) > 0);
}
