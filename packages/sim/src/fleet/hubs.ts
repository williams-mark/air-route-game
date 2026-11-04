// Block-hour pools per hub and aircraft type, and the hub helpers the open-route check and the UI use.
// Pure. Absent `hubId` / `homeHub` mean the home hub, so older saves need no version bump (see serialize.ts).
import type { Aircraft, AircraftType, Airport, Id, Route } from "@arg/contracts";
import { blockHours } from "../finance/ledger";
import { distanceKm } from "../geo";
import type { SimState } from "../state";
import { DEFAULT_HOME_HUB, hubOfAircraft, weeklyCapacityHours } from "./scheduler";

/** Home hub of a state: world.homeHub, else the start airport, else LAX. */
export function homeHubOf(state: SimState): Id {
  return state.world.homeHub ?? state.baseAirport ?? DEFAULT_HOME_HUB;
}

/** Round-trip block hours per weekly frequency on a pair: 2 x one-way block hours. */
export function blockHoursPerFrequency(_route: Pick<Route, "origin" | "destination">, type: AircraftType, distanceKm: number): number {
  return 2 * blockHours(distanceKm, type);
}

export interface HubBlockHours {
  /** Weekly block hours of the active aircraft of the type based at the hub. */
  available: number;
  /** Weekly block hours the routes of that type starting at the hub already need. */
  used: number;
  /** available - used (may be negative when the fleet is over-committed). */
  free: number;
}

/**
 * Block hours a hub has for one aircraft type. `excludeRouteId` leaves one route out of `used` (for editing that route).
 */
export function hubBlockHours(state: SimState, hubId: Id, typeId: Id, excludeRouteId?: Id): HubBlockHours {
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const home = homeHubOf(state);
  const type = state.aircraftTypes.find((t) => t.id === typeId);
  const based = state.world.fleet.filter((ac) => ac.status === "active" && ac.typeId === typeId && hubOfAircraft(ac, home) === hubId);
  const available = type ? based.length * weeklyCapacityHours(type) : 0;
  let used = 0;
  if (type) {
    for (const r of state.world.routes) {
      if (r.origin !== hubId || r.typeId !== typeId || r.id === excludeRouteId) continue;
      const a = airports.get(r.origin), b = airports.get(r.destination);
      if (!a || !b) continue;
      used += r.weeklyFrequency * blockHoursPerFrequency(r, type, distanceKm(a, b));
    }
  }
  return { available, used, free: available - used };
}

/**
 * Block hours of one type summed over every hub it is based at or flies from (`hubId` omitted), or over one hub.
 * The hub list is the bases of the active aircraft of the type plus the origins of its routes.
 */
export function typeBlockHours(state: SimState, typeId: Id, hubId?: Id): HubBlockHours {
  const home = homeHubOf(state);
  const hubs = new Set<Id>();
  for (const ac of state.world.fleet) if (ac.typeId === typeId && ac.status === "active") hubs.add(hubOfAircraft(ac, home));
  for (const r of state.world.routes) if (r.typeId === typeId) hubs.add(r.origin);
  const list = hubId !== undefined ? [hubId] : [...hubs];
  return list.reduce<HubBlockHours>((sum, h) => {
    const p = hubBlockHours(state, h, typeId);
    return { available: sum.available + p.available, used: sum.used + p.used, free: sum.free + p.free };
  }, { available: 0, used: 0, free: 0 });
}

export interface RouteHourSummary extends HubBlockHours {
  /** Weekly block hours the proposed frequency needs on this type. */
  needed: number;
}

/** Live figures for a proposed route, for the UI: needs and hub pool at the origin. */
export function routeHourSummary(
  state: SimState,
  origin: Id,
  destination: Id,
  typeId: Id,
  weeklyFrequency: number,
  excludeRouteId?: Id,
): RouteHourSummary {
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const type = state.aircraftTypes.find((t) => t.id === typeId);
  const a: Airport | undefined = airports.get(origin), b = airports.get(destination);
  const pool = hubBlockHours(state, origin, typeId, excludeRouteId);
  const needed = type && a && b ? weeklyFrequency * blockHoursPerFrequency({ origin, destination }, type, distanceKm(a, b)) : 0;
  return { needed, ...pool };
}

/** Stamp every aircraft with an explicit hubId (migration of saves that predate hubs). Returns the same state when nothing changes. */
export function stampAircraftHubs(state: SimState): SimState {
  const home = homeHubOf(state);
  if (state.world.fleet.every((ac) => ac.hubId !== undefined)) return state;
  const fleet: Aircraft[] = state.world.fleet.map((ac) => (ac.hubId === undefined ? { ...ac, hubId: home } : ac));
  return { ...state, world: { ...state.world, homeHub: state.world.homeHub ?? home, fleet } };
}
