import type { Aircraft, Day, Id } from "@arg/contracts";
import { checksCoveredBy, dueCheck, MAINTENANCE_PARAMS } from "../fleet/maintenance";
import { assign, type AssignPrefs } from "../fleet/scheduler";
import type { AircraftMeta, CheckKind, SimState } from "../state";
import type { AircraftForecast, DowntimeWindow, FleetForecast, PlannerPin } from "./types";

/** Ids and types lookups shared by the planner functions. */
export function simContext(state: SimState) {
  return {
    airports: new Map(state.airports.map((a) => [a.id, a])),
    types: new Map(state.aircraftTypes.map((t) => [t.id, t])),
  };
}

/** Resolve the planner's steering for `day` into scheduler preferences. Undefined when nothing is set. */
export function plannerPrefs(state: SimState, day: Day): AssignPrefs | undefined {
  const pl = state.planner;
  if (!pl) return undefined;
  const pins = new Map<Id, Id>();
  for (const [acId, list] of Object.entries(pl.pins)) {
    const pick = activePin(list, day);
    if (pick) pins.set(acId, pick.routeId);
  }
  const routeTypes = new Map(Object.entries(pl.routeTypes).filter(([, v]) => v.length > 0));
  const reserved = new Set(Object.keys(pl.reserved));
  if (pins.size === 0 && routeTypes.size === 0 && reserved.size === 0) return undefined;
  return { pins, routeTypes, reserved };
}

/** Time-boxed pins beat the standing pin; among time-boxed pins the earliest start wins. */
export function activePin(list: readonly PlannerPin[], day: Day): PlannerPin | undefined {
  let standing: PlannerPin | undefined;
  let boxed: PlannerPin | undefined;
  for (const p of list) {
    if (p.fromDay === undefined && p.toDay === undefined) { standing = p; continue; }
    if ((p.fromDay ?? -Infinity) <= day && day <= (p.toDay ?? Infinity)) {
      if (!boxed || (p.fromDay ?? -Infinity) < (boxed.fromDay ?? -Infinity)) boxed = p;
    }
  }
  return boxed ?? standing;
}

/** Average block hours per day each aircraft flies under today's schedule (drives the A-check clock). */
function hoursPerDay(state: SimState): Map<Id, number> {
  const ctx = { ...simContext(state), prefs: plannerPrefs(state, state.world.day) };
  const sched = assign(state.world.routes, state.world.fleet, ctx);
  return new Map(Object.values(sched.aircraft).map((l) => [l.aircraftId, l.blockHoursPerWeek / 7]));
}

/**
 * Deterministic maintenance forecast for every aircraft over `horizonDays` from the current day. Pure; never mutates `state`.
 * It replays the stepDay check logic per aircraft: deliveries, refits and checks in progress, B/C/D due dates from the
 * calendar clocks (which pause in the hangar), A checks from today's flying hours. The sim may defer a due heavy check
 * for up to `graceDays` when pulling it would drop flights, so every window carries `latestStartDay`.
 */
export function forecastFleet(state: SimState, horizonDays: number): FleetForecast {
  const start = state.world.day;
  const end = start + Math.max(0, Math.floor(horizonDays));
  const rate = hoursPerDay(state);
  const out: Record<Id, AircraftForecast> = {};
  for (const ac of [...state.world.fleet].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const meta = state.fleetMeta[ac.id];
    if (!meta) continue;
    out[ac.id] = forecastAircraft(ac, meta, start, end, rate.get(ac.id) ?? 0);
  }
  return { fromDay: start, toDay: end, aircraft: out };
}

function forecastAircraft(ac: Aircraft, meta: AircraftMeta, start: Day, end: Day, hoursDay: number): AircraftForecast {
  const P = MAINTENANCE_PARAMS;
  const res: AircraftForecast = { aircraftId: ac.id, deliveryDay: null, aChecks: [], windows: [] };
  if (ac.status === "stored") return res;
  const daysSince = { ...meta.daysSince };
  const hoursA = { v: ac.hoursSinceCheck.A };
  let status: "delivery" | "active" | "maintenance" = ac.status === "delivery" ? "delivery" : ac.status === "maintenance" ? "maintenance" : "active";
  let backDay: Day = meta.maintenance?.endDay ?? 0;
  if (status === "maintenance" && meta.maintenance) {
    const kind = meta.maintenance.refit ? "refit" : meta.maintenance.check === "A" ? "refit" : meta.maintenance.check;
    res.windows.push({ kind: kind as DowntimeWindow["kind"], startDay: meta.maintenance.startDay, endDay: meta.maintenance.endDay, underway: true, latestStartDay: meta.maintenance.startDay });
  }
  if (status === "delivery") res.deliveryDay = meta.deliveryDay;
  for (let day = start; day < end; day++) {
    // Mirrors stepDay: deliveries, end of checks, checks falling due, then counters.
    if (status === "delivery" && meta.deliveryDay !== null && meta.deliveryDay <= day) status = "active";
    if (status === "maintenance" && backDay <= day) status = "active";
    if (status === "active") {
      const fake = { hoursSinceCheck: { A: hoursA.v, B: 0, C: 0, D: 0 } } as Aircraft;
      const m = { intervals: meta.intervals, daysSince } as AircraftMeta;
      const kind = dueCheck(fake, m);
      if (kind === "A") {
        res.aChecks.push(day);
        hoursA.v = 0;
      } else if (kind) {
        const down = P.downtimeDays[kind];
        res.windows.push({ kind, startDay: day, endDay: day + down, underway: false, latestStartDay: day + P.graceDays });
        status = "maintenance";
        backDay = day + down;
        for (const k of checksCoveredBy(kind)) daysSince[k as CheckKind] = 0;
        hoursA.v = 0;
      }
    }
    if (status !== "delivery") {
      if (status !== "maintenance") for (const k of ["B", "C", "D"] as const) daysSince[k] += 1;
      if (status === "active") hoursA.v += hoursDay;
    }
  }
  return res;
}

/** Is the aircraft in a forecast window (check/refit/not yet delivered) on `day`? */
export function unavailableOn(fc: AircraftForecast, day: Day): DowntimeWindow | "delivery" | null {
  if (fc.deliveryDay !== null && day < fc.deliveryDay) return "delivery";
  for (const w of fc.windows) if (day >= w.startDay && day < w.endDay) return w;
  return null;
}
