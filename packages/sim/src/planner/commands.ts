import type { AircraftType, Airport, Day, Id } from "@arg/contracts";
import { distanceKm } from "../geo";
import { notice, pushEvents, type CommandError } from "../commands";
import { typeCanServe } from "../fleet/scheduler";
import type { SimState } from "../state";
import { simContext } from "./forecast";
import { EMPTY_PLANNER, type PlannerCommand, type PlannerPin, type PlannerState } from "./types";

export type PlannerOk =
  | { ok: true; kind: "pinAircraft"; aircraftId: Id; routeId: Id | null }
  | { ok: true; kind: "setRouteTypes"; routeId: Id; preferredTypeIds: Id[] }
  | { ok: true; kind: "reserveAircraft"; aircraftId: Id; reserved: boolean }
  | { ok: true; kind: "applyCover"; aircraftId: Id; routeId: Id; fromDay: Day; toDay: Day }
  | { ok: true; kind: "ignoreGap"; gapId: string; ignored: boolean };
export type PlannerResult = PlannerOk | CommandError;

const fail = (error: CommandError["error"], message: string): CommandError => ({ ok: false, error, message });
const isDay = (n: unknown): n is Day => typeof n === "number" && Number.isFinite(n);

/** Planner state with finished time-boxed pins removed. */
export function pruned(pl: PlannerState, today: Day): PlannerState {
  const pins: PlannerState["pins"] = {};
  for (const [id, list] of Object.entries(pl.pins)) {
    const keep = list.filter((p) => p.toDay === undefined || p.toDay >= today);
    if (keep.length) pins[id] = keep;
  }
  return { ...pl, pins };
}

export function applyPlannerCommand(state: SimState, cmd: PlannerCommand): { state: SimState; result: PlannerResult } {
  const ctx = simContext(state);
  const pl = pruned(state.planner ?? EMPTY_PLANNER, state.world.day);
  const set = (next: PlannerState, text?: string): SimState => {
    const s: SimState = { ...state, planner: next };
    return text ? pushEvents(s, [notice(state, text)]) : s;
  };
  const aircraftOf = (id: Id) => state.world.fleet.find((a) => a.id === id);
  const routeOf = (id: Id) => state.world.routes.find((r) => r.id === id);

  switch (cmd.kind) {
    case "pinAircraft": {
      const ac = aircraftOf(cmd.aircraftId);
      if (!ac) return { state, result: fail("unknown_aircraft", `No aircraft "${cmd.aircraftId}".`) };
      if (cmd.routeId === null) {
        const { [ac.id]: _gone, ...rest } = pl.pins;
        return { state: set({ ...pl, pins: rest }, `${ac.tailNumber} is no longer pinned to a route.`), result: { ok: true, kind: "pinAircraft", aircraftId: ac.id, routeId: null } };
      }
      const err = pinProblem(state, ac.id, cmd.routeId);
      if (err) return { state, result: err };
      if ((cmd.fromDay !== undefined && !isDay(cmd.fromDay)) || (cmd.toDay !== undefined && !isDay(cmd.toDay)) || (isDay(cmd.fromDay) && isDay(cmd.toDay) && cmd.toDay < cmd.fromDay)) {
        return { state, result: fail("invalid_frequency", "The pin window must be a valid date range.") };
      }
      const route = routeOf(cmd.routeId)!;
      const pin: PlannerPin = { routeId: route.id, ...(cmd.fromDay !== undefined ? { fromDay: cmd.fromDay } : {}), ...(cmd.toDay !== undefined ? { toDay: cmd.toDay } : {}) };
      const boxed = pin.fromDay !== undefined || pin.toDay !== undefined;
      const others = (pl.pins[ac.id] ?? []).filter((p) => (boxed ? !(p.fromDay === pin.fromDay && p.toDay === pin.toDay) : p.fromDay !== undefined || p.toDay !== undefined));
      const { [ac.id]: _r, ...reserved } = pl.reserved;
      void _r;
      return {
        state: set({ ...pl, pins: { ...pl.pins, [ac.id]: [...others, pin] }, reserved }, `${ac.tailNumber} is pinned to ${route.origin}-${route.destination}${boxed ? " for a set period" : ""}.`),
        result: { ok: true, kind: "pinAircraft", aircraftId: ac.id, routeId: route.id },
      };
    }
    case "applyCover": {
      const ac = aircraftOf(cmd.aircraftId);
      if (!ac) return { state, result: fail("unknown_aircraft", `No aircraft "${cmd.aircraftId}".`) };
      if (!isDay(cmd.fromDay) || !isDay(cmd.toDay) || cmd.toDay < cmd.fromDay) return { state, result: fail("invalid_frequency", "The cover window must be a valid date range.") };
      const err = pinProblem(state, ac.id, cmd.routeId);
      if (err) return { state, result: err };
      const route = routeOf(cmd.routeId)!;
      const others = (pl.pins[ac.id] ?? []).filter((p) => !(p.fromDay === cmd.fromDay && p.toDay === cmd.toDay));
      const { [ac.id]: _r, ...reserved } = pl.reserved;
      void _r;
      return {
        state: set({ ...pl, pins: { ...pl.pins, [ac.id]: [...others, { routeId: route.id, fromDay: cmd.fromDay, toDay: cmd.toDay }] }, reserved }, `${ac.tailNumber} will cover ${route.origin}-${route.destination} from day ${cmd.fromDay} to ${cmd.toDay}.`),
        result: { ok: true, kind: "applyCover", aircraftId: ac.id, routeId: route.id, fromDay: cmd.fromDay, toDay: cmd.toDay },
      };
    }
    case "setRouteTypes": {
      const route = routeOf(cmd.routeId);
      if (!route) return { state, result: fail("unknown_route", `No route with id "${cmd.routeId}".`) };
      if (!Array.isArray(cmd.preferredTypeIds)) return { state, result: fail("unknown_type", "Preferred types must be a list.") };
      const seen = new Set<Id>();
      for (const t of cmd.preferredTypeIds) {
        if (!ctx.types.has(t)) return { state, result: fail("unknown_type", `Unknown aircraft type "${t}".`) };
        seen.add(t);
      }
      const list = [...seen].filter((t) => t !== route.typeId);
      const routeTypes = { ...pl.routeTypes };
      if (list.length) routeTypes[route.id] = list; else delete routeTypes[route.id];
      return { state: set({ ...pl, routeTypes }), result: { ok: true, kind: "setRouteTypes", routeId: route.id, preferredTypeIds: list } };
    }
    case "reserveAircraft": {
      const ac = aircraftOf(cmd.aircraftId);
      if (!ac) return { state, result: fail("unknown_aircraft", `No aircraft "${cmd.aircraftId}".`) };
      const reserved = { ...pl.reserved };
      const pins = { ...pl.pins };
      if (cmd.reserve) { reserved[ac.id] = true; delete pins[ac.id]; } else delete reserved[ac.id];
      return {
        state: set({ ...pl, reserved, pins }, `${ac.tailNumber} ${cmd.reserve ? "is held as a spare" : "is back in the schedule pool"}.`),
        result: { ok: true, kind: "reserveAircraft", aircraftId: ac.id, reserved: !!cmd.reserve },
      };
    }
    case "ignoreGap": {
      if (typeof cmd.gapId !== "string") return { state, result: fail("unknown_route", "Unknown coverage gap.") };
      const rest = pl.ignoredGaps.filter((g) => g !== cmd.gapId);
      return { state: set({ ...pl, ignoredGaps: cmd.ignore ? [...rest, cmd.gapId] : rest }), result: { ok: true, kind: "ignoreGap", gapId: cmd.gapId, ignored: !!cmd.ignore } };
    }
  }
}

/** Plain-language reason a type cannot fly a pair (range with reserves, or a runway that is too short). */
export function infeasibleReason(a: Airport, b: Airport, type: AircraftType): string {
  const short = a.runwayM < type.runwayNeededM ? a : b.runwayM < type.runwayNeededM ? b : null;
  if (short) return `${type.name} needs a ${type.runwayNeededM} m runway; ${short.id} has ${short.runwayM} m.`;
  return `${a.id}-${b.id} is ${Math.round(distanceKm(a, b))} km; the ${type.name} (range ${type.rangeKm} km) cannot fly it with reserves.`;
}

/** Why this aircraft cannot be pinned to this route, or null. */
function pinProblem(state: SimState, aircraftId: Id, routeId: Id): CommandError | null {
  const ctx = simContext(state);
  const ac = state.world.fleet.find((a) => a.id === aircraftId);
  const route = state.world.routes.find((r) => r.id === routeId);
  if (!ac) return fail("unknown_aircraft", `No aircraft "${aircraftId}".`);
  if (!route) return fail("unknown_route", `No route with id "${routeId}".`);
  const type = ctx.types.get(ac.typeId);
  const a = ctx.airports.get(route.origin), b = ctx.airports.get(route.destination);
  if (!type || !a || !b) return fail("unknown_type", "Unknown aircraft type or airport.");
  if (ac.status === "stored") return fail("aircraft_unavailable", `${ac.tailNumber} is in storage.`);
  if (!typeCanServe(a, b, type)) {
    return fail(a.runwayM < type.runwayNeededM || b.runwayM < type.runwayNeededM ? "runway_too_short" : "out_of_range",
      infeasibleReason(a, b, type));
  }
  return null;
}
