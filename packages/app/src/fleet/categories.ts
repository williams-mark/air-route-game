// Pure helpers for aircraft categories in the Fleet view and the route screens. The sim owns the rules (planner/categories.ts).
import type { CabinLayout } from "@arg/contracts";
import { categoryOfAircraft, type AircraftCategory, type SimState } from "@arg/sim";

export type CategoryFilter = "all" | "none" | string;

/** Categories of a game, sorted by name. */
export function categoriesOf(sim: SimState | null): AircraftCategory[] {
  return Object.values(sim?.planner?.categories ?? {}).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
}

/** Category id of each aircraft id (aircraft in no category are absent). */
export function aircraftCategories(sim: SimState | null): Map<string, string> {
  return sim ? categoryOfAircraft(sim.planner, sim.world.fleet) : new Map();
}

/** True when an aircraft passes the category filter. */
export function inCategory(aircraftId: string, filter: CategoryFilter, cats: ReadonlyMap<string, string>): boolean {
  if (filter === "all") return true;
  const c = cats.get(aircraftId);
  return filter === "none" ? c === undefined : c === filter;
}

/** Seats per cabin as First/Business/Premium economy/Economy, e.g. "0/12/0/150" for a 162-seat two-class 737-800. */
export function seatSplit(layout: CabinLayout | undefined): string {
  if (!layout) return "–";
  const n = { F: 0, J: 0, W: 0, Y: 0 };
  for (const s of layout.sections) n[s.cls] += s.rows * s.seatsAcross;
  return `${n.F}/${n.J}/${n.W}/${n.Y}`;
}

/** Natural A-Z order of type names ("A320ceo" before "A320neo" before "A321ceo", "737" before "1011"). */
/** Aircraft per category among those based at `hub` ("all": every hub; no hub set means the home hub), like the type table. */
export function categoryCounts(fleet: readonly { id: string; hub?: string }[], cats: ReadonlyMap<string, string>, hub: string, home?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of fleet) {
    const c = cats.get(a.id);
    if (c && (hub === "all" || (a.hub ?? home) === hub)) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

export const byName =(a: string, b: string): number => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
