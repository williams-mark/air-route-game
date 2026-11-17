// Aircraft categories ("fleet policies" for aircraft): player-made groups of aircraft that routes can be assigned to instead of
// one aircraft type. The scheduler may fly a categorised route with any active aircraft of the category based at one of its
// ends. Once a month the routes of each category are ranked by load factor, and the scheduler gives the highest-ranked routes
// first pick, largest aircraft (by seats) first, so bigger aircraft drift to the fullest routes.
// Pure; all state lives in `SimState.planner` (optional fields, so old saves load unchanged).
import type { Aircraft, Day, Id } from "@arg/contracts";
import { layoutSeats } from "../fleet/layout";
import { distanceKm } from "../geo";
import { blockHours } from "../finance/ledger";
import { DEFAULT_HOME_HUB, hubOfAircraft, weeklyCapacityHours } from "../fleet/scheduler";
import { dayToDate } from "../time/calendar";
import type { SimState } from "../state";
import type { PlannerState } from "./types";

export interface AircraftCategory {
  id: Id;
  name: string;
  /** Aircraft of these types join the category automatically unless placed in another category (or in none) explicitly. */
  autoTypeIds: Id[];
}

/** Most categories an airline may define. */
export const MAX_CATEGORIES = 30;

/**
 * Category of every aircraft: an explicit choice (`aircraftCategory`, null = explicitly none) wins; otherwise the first category
 * (by id) that lists the aircraft's type in `autoTypeIds`. Aircraft in no category are absent from the map.
 */
export function categoryOfAircraft(pl: PlannerState | undefined, fleet: readonly Pick<Aircraft, "id" | "typeId">[]): Map<Id, Id> {
  const out = new Map<Id, Id>();
  const cats = Object.values(pl?.categories ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1));
  const explicit = pl?.aircraftCategory ?? {};
  for (const ac of fleet) {
    if (Object.prototype.hasOwnProperty.call(explicit, ac.id)) {
      const c = explicit[ac.id];
      if (c && pl?.categories?.[c]) out.set(ac.id, c);
      continue;
    }
    const auto = cats.find((c) => c.autoTypeIds.includes(ac.typeId));
    if (auto) out.set(ac.id, auto.id);
  }
  return out;
}

/** Aircraft ids of each category. */
export function categoryMembers(pl: PlannerState | undefined, fleet: readonly Pick<Aircraft, "id" | "typeId">[]): Map<Id, Id[]> {
  const out = new Map<Id, Id[]>();
  for (const id of Object.keys(pl?.categories ?? {})) out.set(id, []);
  for (const [acId, c] of categoryOfAircraft(pl, fleet)) out.get(c)?.push(acId);
  return out;
}

/** The category a route is assigned to, if that category still exists. */
export function routeCategoryOf(pl: PlannerState | undefined, routeId: Id): Id | undefined {
  const c = pl?.routeCategory?.[routeId];
  return c && pl?.categories?.[c] ? c : undefined;
}

/**
 * Monthly ranking: on the first day of each month (or when there is none yet, or the set of categorised routes changed), each
 * categorised route's rank is its load factor in the latest daily report. Returns the state unchanged when no refresh is due.
 */
export function refreshCategoryRanking(state: SimState): SimState {
  const pl = state.planner;
  const routes = Object.keys(pl?.routeCategory ?? {}).filter((id) => routeCategoryOf(pl, id) && state.world.routes.some((r) => r.id === id)).sort();
  if (!pl || routes.length === 0) return state;
  const day: Day = state.world.day;
  const ranked = Object.keys(pl.routeRank ?? {}).sort();
  const sameSet = ranked.length === routes.length && ranked.every((id, i) => id === routes[i]);
  const monthStart = dayToDate(day).dayOfMonth === 1;
  if (sameSet && pl.rankDay !== undefined && !(monthStart && pl.rankDay !== day)) return state;
  const routeRank: Record<Id, number> = {};
  for (const id of routes) routeRank[id] = state.routeReports[id]?.evaluation.loadFactor ?? 0;
  return { ...state, planner: { ...pl, routeRank, rankDay: day } };
}

/** Seats of an aircraft (its own cabin). */
export const seatsOf = (ac: Pick<Aircraft, "layout">): number => layoutSeats(ac.layout);

/**
 * Block hours of one category at a hub (or summed over all hubs): weekly hours of its active aircraft based there, and the
 * hours its categorised routes from that hub need (planned with each route's own aircraft type). `excludeRouteId` leaves a
 * route out of `used` (for editing it).
 */
export function categoryBlockHours(state: SimState, categoryId: Id, hubId?: Id, excludeRouteId?: Id): { available: number; used: number; free: number } {
  const pl = state.planner;
  const home = state.world.homeHub ?? state.baseAirport ?? DEFAULT_HOME_HUB;
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const members = new Set(categoryMembers(pl, state.world.fleet).get(categoryId) ?? []);
  let available = 0;
  for (const ac of state.world.fleet) {
    if (!members.has(ac.id) || ac.status !== "active") continue;
    if (hubId !== undefined && hubOfAircraft(ac, home) !== hubId) continue;
    const t = types.get(ac.typeId);
    if (t) available += weeklyCapacityHours(t);
  }
  let used = 0;
  for (const r of state.world.routes) {
    if (r.id === excludeRouteId || routeCategoryOf(pl, r.id) !== categoryId) continue;
    if (hubId !== undefined && r.origin !== hubId) continue;
    const t = types.get(r.typeId), a = airports.get(r.origin), b = airports.get(r.destination);
    if (t && a && b) used += r.weeklyFrequency * 2 * blockHours(distanceKm(a, b), t);
  }
  return { available, used, free: available - used };
}
