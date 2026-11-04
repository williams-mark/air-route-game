// Pure rows for the Fleet view's type table and the route sandbox's owned-type filter. No React, no sim calls:
// the caller supplies the block-hour figures (from the sim) so these helpers stay trivially testable.
import type { FleetItem } from "../sim/bridge";

export type HubFilter = "all" | string;

export interface TypeRow {
  typeId: string;
  typeName: string;
  /** Aircraft flying or in the hangar (not on order, not stored), at the selected hub. */
  inService: number;
  /** Aircraft on order, at the selected hub. */
  onOrder: number;
  /** Weekly block hours of the active aircraft of the type. */
  availableHours: number;
  /** Weekly block hours the routes of the type already need. */
  usedHours: number;
  /** availableHours - usedHours. */
  freeHours: number;
}

export interface TypeHours { available: number; used: number; free: number }

/** Hubs present in the fleet, plus the given home hub, sorted with the home hub first. */
export function hubOptions(fleet: readonly FleetItem[], home?: string): string[] {
  const set = new Set<string>();
  for (const a of fleet) if (a.hub) set.add(a.hub);
  if (home) set.add(home);
  return [...set].sort((x, y) => (x === home ? -1 : y === home ? 1 : x.localeCompare(y, "en")));
}

/** True when the aircraft is at the selected hub (every aircraft counts for "all"). */
export function atHub(a: Pick<FleetItem, "hub">, hub: HubFilter, home?: string): boolean {
  if (hub === "all") return true;
  return (a.hub ?? home) === hub;
}

/**
 * One row per aircraft type in the fleet (including types with only stored aircraft), in fleet order of first appearance.
 * `hoursFor(typeId)` supplies the block hours for the selected hub filter.
 */
export function buildTypeRows(
  fleet: readonly FleetItem[],
  hub: HubFilter,
  hoursFor: (typeId: string, hub: HubFilter) => TypeHours,
  home?: string,
): TypeRow[] {
  const rows = new Map<string, TypeRow>();
  for (const a of fleet) {
    let r = rows.get(a.typeId);
    if (!r) {
      const h = hoursFor(a.typeId, hub);
      r = { typeId: a.typeId, typeName: a.typeName, inService: 0, onOrder: 0, availableHours: h.available, usedHours: h.used, freeHours: h.free };
      rows.set(a.typeId, r);
    }
    if (!atHub(a, hub, home)) continue;
    if (a.status === "delivery") r.onOrder++;
    else if (a.status !== "stored") r.inService++;
  }
  return [...rows.values()];
}

/** Type ids the airline owns (in the fleet, not stored) or has on order: the only types the route sandbox offers. */
export function ownedOrOrderedTypeIds(fleet: readonly Pick<FleetItem, "typeId" | "status">[]): Set<string> {
  const ids = new Set<string>();
  for (const a of fleet) if (a.status !== "stored") ids.add(a.typeId);
  return ids;
}
