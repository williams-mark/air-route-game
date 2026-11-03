import type { Aircraft, AircraftType, Airport, Id, Route } from "@arg/contracts";
import { blockHours, isRangeFeasible } from "../finance/ledger";
import { distanceKm, simRunwayM } from "../geo";
import type { RouteScheduling } from "../state";

/** Planned utilisation targets, block hours per aircraft per day. */
export const SCHEDULER_PARAMS = {
  blockHoursPerDay: { narrow: 9.5, wide: 12.5 },
} as const;

/** Planner steering resolved for one day (see planner/). Absent or empty = the default scheduler behaviour. */
export interface AssignPrefs {
  /** Aircraft id -> route id it should fly first, when active and able to serve the pair. */
  pins?: ReadonlyMap<Id, Id>;
  /** Route id -> ordered fallback type ids tried (after the requested type) before the same-size-class substitutes. */
  routeTypes?: ReadonlyMap<Id, readonly Id[]>;
  /** Aircraft held back as spares: not scheduled at all (a pin on the aircraft overrides). */
  reserved?: ReadonlySet<Id>;
}

export interface ScheduleContext {
  airports: ReadonlyMap<Id, Airport>;
  types: ReadonlyMap<Id, AircraftType>;
  prefs?: AssignPrefs;
}

export interface AircraftLoad {
  aircraftId: Id;
  /** Planned block hours per week. */
  blockHoursPerWeek: number;
  /** Round trips per week by route. */
  assignments: { routeId: Id; roundTrips: number; blockHoursPerRoundTrip: number }[];
}

export interface ScheduleResult {
  routes: Record<Id, RouteScheduling>;
  aircraft: Record<Id, AircraftLoad>;
}

/** Can this type fly the pair nonstop (range with reserves, both runways)? */
export function typeCanServe(a: Airport, b: Airport, type: AircraftType): boolean {
  const km = distanceKm(a, b);
  const need = simRunwayM(type, km);
  return isRangeFeasible(km, type) && a.runwayM >= need && b.runwayM >= need;
}

export function weeklyCapacityHours(type: AircraftType): number {
  return SCHEDULER_PARAMS.blockHoursPerDay[type.widebody ? "wide" : "narrow"] * 7;
}

/**
 * Greedy block-hour scheduler. Aircraft that are not 'active' (maintenance, delivery, stored) are ignored.
 * Routes are served widebodies first, then by weekly block-hour need, largest first. Each route takes round trips
 * from aircraft of its requested type first (best fit: the smallest aircraft with room for everything, else the
 * one with most room), then from other feasible types of the same size class. Whole round trips only; frequencies
 * the fleet cannot cover are reported as `underSupplied`.
 */
export function assign(routes: readonly Route[], fleet: readonly Aircraft[], ctx: ScheduleContext): ScheduleResult {
  const free = new Map<Id, number>();
  const loads: Record<Id, AircraftLoad> = {};
  const prefs = ctx.prefs;
  const active = fleet
    .filter((ac) => ac.status === "active" && ctx.types.has(ac.typeId) && !(prefs?.reserved?.has(ac.id) && !prefs.pins?.has(ac.id)))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const ac of active) {
    free.set(ac.id, weeklyCapacityHours(ctx.types.get(ac.typeId)!));
    loads[ac.id] = { aircraftId: ac.id, blockHoursPerWeek: 0, assignments: [] };
  }

  const prepared = routes.map((route) => {
    const a = ctx.airports.get(route.origin);
    const b = ctx.airports.get(route.destination);
    const reqType = ctx.types.get(route.typeId);
    const dist = a && b ? distanceKm(a, b) : 0;
    const need = reqType && a && b ? 2 * route.weeklyFrequency * blockHours(dist, reqType) : 0;
    return { route, a, b, reqType, dist, need };
  });
  const order = [...prepared].sort(
    (p, q) =>
      Number(q.reqType?.widebody ?? false) - Number(p.reqType?.widebody ?? false) ||
      q.need - p.need ||
      (p.route.id < q.route.id ? -1 : 1),
  );

  const out: Record<Id, RouteScheduling> = {};
  for (const p of prepared) {
    out[p.route.id] = {
      scheduledFrequency: 0, underSupplied: p.route.weeklyFrequency, aircraftIds: [], substitutedFrequency: 0, blockHoursPerWeek: 0, roundTripsByAircraft: {},
    };
  }

  const usedBy = new Map<Id, Map<Id, number>>();
  const leftBy = new Map<Id, number>();
  for (const p of prepared) { usedBy.set(p.route.id, new Map()); leftBy.set(p.route.id, p.route.weeklyFrequency); }

  // Pins first (all routes), so a pinned aircraft is not taken by an earlier route in the main order.
  if (prefs?.pins && prefs.pins.size > 0) {
    for (const ac of active) {
      const rid = prefs.pins.get(ac.id);
      const p = rid === undefined ? undefined : prepared.find((q) => q.route.id === rid);
      if (!p || !p.a || !p.b || !p.reqType) continue;
      const type = ctx.types.get(ac.typeId)!;
      if (!typeCanServe(p.a, p.b, type)) continue;
      const left = leftBy.get(p.route.id)!;
      const rt = 2 * blockHours(p.dist, type);
      const k = Math.min(left, Math.floor((free.get(ac.id)! + 1e-9) / rt));
      if (k < 1) continue;
      const res = out[p.route.id]!;
      free.set(ac.id, free.get(ac.id)! - k * rt);
      const load = loads[ac.id]!;
      load.blockHoursPerWeek += k * rt;
      load.assignments.push({ routeId: p.route.id, roundTrips: k, blockHoursPerRoundTrip: rt });
      const used = usedBy.get(p.route.id)!;
      used.set(ac.id, (used.get(ac.id) ?? 0) + k * rt);
      res.scheduledFrequency += k;
      res.blockHoursPerWeek += k * rt;
      res.roundTripsByAircraft![ac.id] = (res.roundTripsByAircraft![ac.id] ?? 0) + k;
      if (type.id !== p.reqType.id) res.substitutedFrequency += k;
      leftBy.set(p.route.id, left - k);
    }
  }

  for (const p of order) {
    const { route, a, b, reqType } = p;
    const res = out[route.id]!;
    if (!a || !b || !reqType) continue;
    let left = leftBy.get(route.id)!;
    const used = usedBy.get(route.id)!;
    const fallbacks = (prefs?.routeTypes?.get(route.id) ?? []).filter((t) => t !== reqType.id);
    const passes: Array<"requested" | "substitute" | string> = ["requested", ...fallbacks.map((t) => `type:${t}`), "substitute"];
    for (const pass of passes) {
      while (left > 0) {
        const cands = active
          .map((ac) => ({ ac, type: ctx.types.get(ac.typeId)! }))
          .filter(({ type }) =>
            pass === "requested"
              ? type.id === reqType.id && typeCanServe(a, b, type)
              : pass.startsWith("type:")
                ? type.id === pass.slice(5) && typeCanServe(a, b, type)
                : type.id !== reqType.id && type.widebody === reqType.widebody && typeCanServe(a, b, type))
          .map(({ ac, type }) => {
            const rt = 2 * blockHours(p.dist, type);
            return { ac, type, rt, fit: Math.floor((free.get(ac.id)! + 1e-9) / rt) };
          })
          .filter((c) => c.fit >= 1);
        if (cands.length === 0) break;
        const whole = cands.filter((c) => c.fit >= left).sort((x, y) => free.get(x.ac.id)! - free.get(y.ac.id)!);
        const pick = whole[0] ?? cands.sort((x, y) => y.fit - x.fit || (x.ac.id < y.ac.id ? -1 : 1))[0]!;
        const k = Math.min(left, pick.fit);
        free.set(pick.ac.id, free.get(pick.ac.id)! - k * pick.rt);
        const load = loads[pick.ac.id]!;
        load.blockHoursPerWeek += k * pick.rt;
        load.assignments.push({ routeId: route.id, roundTrips: k, blockHoursPerRoundTrip: pick.rt });
        used.set(pick.ac.id, (used.get(pick.ac.id) ?? 0) + k * pick.rt);
        res.scheduledFrequency += k;
        res.blockHoursPerWeek += k * pick.rt;
        res.roundTripsByAircraft![pick.ac.id] = (res.roundTripsByAircraft![pick.ac.id] ?? 0) + k;
        if (pass !== "requested") res.substitutedFrequency += k;
        left -= k;
      }
    }
    res.underSupplied = left;
    res.aircraftIds = [...used.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([id]) => id);
  }
  return { routes: out, aircraft: loads };
}
