import type { Aircraft, Day, Id, Route } from "@arg/contracts";
import { layoutSeats } from "../fleet/layout";
import { assign, typeCanServe, weeklyCapacityHours, type ScheduleResult } from "../fleet/scheduler";
import { blockHours } from "../finance/ledger";
import { distanceKm } from "../geo";
import { simulateRouteWeek } from "../route/routeModel";
import type { SimState } from "../state";
import { dayToDate } from "../time/calendar";
import { forecastFleet, plannerPrefs, simContext, unavailableOn } from "./forecast";
import type { CoverageGap, CoverSuggestion, DowntimeWindow, FleetForecast } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(day: Day, withYear = false): string {
  const d = dayToDate(day);
  return `${d.dayOfMonth} ${MONTHS[d.month]}${withYear ? ` ${d.year}` : ""}`;
}

/** Fleet with statuses as the forecast says they will be on `day`. `reference` keeps aircraft in checks flying. */
function fleetOn(state: SimState, fc: FleetForecast, day: Day, reference: boolean): Aircraft[] {
  return state.world.fleet.map((ac) => {
    if (ac.status === "stored") return ac;
    const f = fc.aircraft[ac.id];
    if (!f) return ac;
    const u = unavailableOn(f, day);
    let status: Aircraft["status"] = "active";
    if (u === "delivery") status = "delivery";
    else if (u && !reference) status = "maintenance";
    return status === ac.status ? ac : { ...ac, status };
  });
}

function schedAt(state: SimState, fleet: Aircraft[], day: Day, extraPin?: [Id, Id]): ScheduleResult {
  let prefs = plannerPrefs(state, day);
  if (extraPin) {
    prefs = { ...prefs, pins: new Map([...(prefs?.pins ?? []), extraPin]) };
  }
  return assign(state.world.routes, fleet, { ...simContext(state), prefs });
}

/** Days on which any aircraft changes availability, inside [from, to). */
function breakpoints(fc: FleetForecast, from: Day, to: Day): Day[] {
  const set = new Set<Day>([from]);
  for (const f of Object.values(fc.aircraft)) {
    if (f.deliveryDay !== null) set.add(f.deliveryDay);
    for (const w of f.windows) { set.add(w.startDay); set.add(w.endDay); }
  }
  return [...set].filter((d) => d >= from && d < to).sort((a, b) => a - b);
}

/**
 * Where the forecast leaves a route short of its requested weekly round trips. Runs the real scheduler on the fleet
 * as it will stand on each day something changes, so the answer includes pins, preferred types and reserved spares.
 * Gaps the player ignored (`planner.ignoredGaps`) are omitted. Sorted by start date, then severity.
 */
export function coverageGaps(state: SimState, horizonDays: number, forecast?: FleetForecast, minDays = 1): CoverageGap[] {
  const fc = forecast ?? forecastFleet(state, horizonDays);
  const from = fc.fromDay, to = fc.toDay;
  if (to <= from || state.world.routes.length === 0) return [];
  const pts = breakpoints(fc, from, to);
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const routeById = new Map(state.world.routes.map((r) => [r.id, r]));
  const open = new Map<Id, CoverageGap>();
  const done: CoverageGap[] = [];

  const close = (g: CoverageGap, end: Day) => { g.toDay = end - 1; done.push(g); };
  for (let i = 0; i < pts.length; i++) {
    const day = pts[i]!;
    const next = pts[i + 1] ?? to;
    const real = schedAt(state, fleetOn(state, fc, day, false), day);
    const ref = schedAt(state, fleetOn(state, fc, day, true), day);
    const down = state.world.fleet.filter((ac) => ac.status !== "stored" && fc.aircraft[ac.id] && unavailableOn(fc.aircraft[ac.id]!, day) !== null);
    for (const route of state.world.routes) {
      const r = real.routes[route.id];
      const f = ref.routes[route.id];
      if (!r || !f) continue;
      const gap = open.get(route.id);
      if (r.underSupplied <= 0) { if (gap) { close(gap, day); open.delete(route.id); } continue; }
      const lost = Math.max(0, f.scheduledFrequency - r.scheduledFrequency);
      if (gap && gap.scheduledPerWeek === r.scheduledFrequency && gap.lostToDowntime === lost) {
        addCauses(gap, route.id, down, fc, ref, day, next);
        continue;
      }
      if (gap) { close(gap, day); open.delete(route.id); }
      const g: CoverageGap = {
        id: "", routeId: route.id, fromDay: day, toDay: next - 1, requestedPerWeek: route.weeklyFrequency,
        scheduledPerWeek: r.scheduledFrequency, lostToDowntime: lost, structural: lost === 0, causes: [], severity: 0, summary: "",
      };
      addCauses(g, route.id, down, fc, ref, day, next);
      open.set(route.id, g);
    }
  }
  for (const g of open.values()) close(g, to);

  const ignored = new Set(state.planner?.ignoredGaps ?? []);
  const out: CoverageGap[] = [];
  for (const g of done) {
    const route = routeById.get(g.routeId)!;
    g.id = `${g.routeId}:${g.fromDay}:${g.toDay}`;
    if (ignored.has(g.id) || (g.toDay - g.fromDay + 1 < minDays && !g.structural)) continue;
    const missing = g.requestedPerWeek - g.scheduledPerWeek;
    const days = g.toDay - g.fromDay + 1;
    g.severity = Math.round((missing / Math.max(1, g.requestedPerWeek)) * (0.5 + 0.5 * Math.min(1, days / 30)) * 1000) / 1000;
    g.summary = describeGap(g, route, state, types);
    out.push(g);
  }
  return out.sort((a, b) => a.fromDay - b.fromDay || b.severity - a.severity || (a.routeId < b.routeId ? -1 : 1));
}

function addCauses(g: CoverageGap, routeId: Id, down: Aircraft[], fc: FleetForecast, ref: ScheduleResult, from: Day, to: Day) {
  for (const ac of down) {
    if (!ref.aircraft[ac.id]?.assignments.some((a) => a.routeId === routeId)) continue;
    if (g.causes.some((c) => c.aircraftId === ac.id)) continue;
    const f = fc.aircraft[ac.id]!;
    const u = unavailableOn(f, from);
    if (!u) continue;
    if (u === "delivery") g.causes.push({ aircraftId: ac.id, kind: "delivery", startDay: fc.fromDay, endDay: f.deliveryDay ?? to });
    else g.causes.push({ aircraftId: ac.id, kind: u.kind, startDay: u.startDay, endDay: u.endDay });
  }
}

function describeGap(g: CoverageGap, route: Route, state: SimState, _types: Map<Id, unknown>): string {
  const name = `${route.origin}-${route.destination}`;
  const missing = g.requestedPerWeek - g.scheduledPerWeek;
  const tails = new Map(state.world.fleet.map((a) => [a.id, a]));
  const why = g.causes.length
    ? g.causes.map((c) => { const a = tails.get(c.aircraftId); return `${a?.typeId ?? ""} ${a?.tailNumber ?? c.aircraftId} ${c.kind === "refit" ? "in refit" : c.kind === "delivery" ? "not yet delivered" : `in ${c.kind}-check`}`.trim(); }).join(", ")
    : g.structural ? "not enough suitable aircraft" : "aircraft in maintenance";
  const yr = dayToDate(g.fromDay).year !== dayToDate(g.toDay).year;
  const span = g.fromDay === g.toDay ? shortDate(g.fromDay) : `${shortDate(g.fromDay, yr)}-${shortDate(g.toDay, yr)}`;
  return `${name} ${g.structural ? "is short" : "loses"} ${missing}/${g.requestedPerWeek} weekly rotations ${span}: ${why}`;
}

// --- Substitution ---------------------------------------------------------

const classMix = (ac: Aircraft) => {
  const m: Record<string, number> = {};
  for (const s of ac.layout.sections) m[s.cls] = (m[s.cls] ?? 0) + s.rows * s.seatsAcross;
  return m;
};

/** Weekly profit of a route flown `fraction` of the time by `lead` (its type and cabin), without ownership. */
function profitAt(state: SimState, route: Route, lead: Aircraft | undefined, fraction: number, day: Day): number {
  const ctx = simContext(state);
  const r = lead && lead.typeId !== route.typeId ? { ...route, typeId: lead.typeId } : route;
  const wk = simulateRouteWeek(r, ctx.airports, ctx.types, day, { fleetAircraft: lead ? [lead] : [], operatedFraction: Math.max(0, Math.min(1, fraction)), chargeOwnership: false });
  return wk && wk.evaluation.feasible ? wk.evaluation.profit : 0;
}

/**
 * Rank aircraft that could cover a gap. Candidates are in service for the whole window (no forecast check, delivered),
 * not one of the aircraft the gap is losing, and able to fly the pair (range, runway, seats). Each candidate is tried
 * with a real scheduler run with the pin applied, so the answer accounts for trips it would stop flying elsewhere.
 * Ranking: reserved spare or idle first, same type, then same size class, then other size class; weekly profit delta
 * (all routes) breaks ties. Returns at most `limit` (default 5).
 */
export function suggestCover(state: SimState, gap: CoverageGap, limit = 5, forecast?: FleetForecast): CoverSuggestion[] {
  const route = state.world.routes.find((r) => r.id === gap.routeId);
  if (!route) return [];
  const ctx = simContext(state);
  const a = ctx.airports.get(route.origin), b = ctx.airports.get(route.destination);
  const reqType = ctx.types.get(route.typeId);
  if (!a || !b || !reqType) return [];
  const fc = forecast ?? forecastFleet(state, Math.max(1, gap.toDay + 2 - state.world.day));
  const day = gap.fromDay;
  const fleet = fleetOn(state, fc, day, false);
  const base = schedAt(state, fleet, day);
  const baseRoute = base.routes[route.id]!;
  const causeIds = new Set(gap.causes.map((c) => c.aircraftId));
  const causeAc = state.world.fleet.find((x) => causeIds.has(x.id));
  const baselineSeats = causeAc ? layoutSeats(causeAc.layout) : 0;
  const reserved = state.planner?.reserved ?? {};
  const byId = new Map(fleet.map((x) => [x.id, x]));
  const routeProfit = (res: ScheduleResult, rt: Route): number => {
    const sc = res.routes[rt.id];
    if (!sc) return 0;
    const lead = sc.aircraftIds.length ? byId.get(sc.aircraftIds[0]!) : undefined;
    return profitAt(state, rt, lead, sc.scheduledFrequency / rt.weeklyFrequency, day);
  };
  const baseProfits = new Map<Id, number>();
  const changed = (x: ScheduleResult["routes"][string] | undefined, y: ScheduleResult["routes"][string] | undefined) =>
    !x || !y || x.scheduledFrequency !== y.scheduledFrequency || x.aircraftIds.join() !== y.aircraftIds.join();
  const missing = gap.requestedPerWeek - baseRoute.scheduledFrequency;
  const out: CoverSuggestion[] = [];
  for (const ac of fleet) {
    if (ac.status !== "active" || causeIds.has(ac.id)) continue;
    const f = fc.aircraft[ac.id];
    if (f) {
      const clash = f.windows.some((w) => w.startDay <= gap.toDay && w.endDay > gap.fromDay);
      if (clash || (f.deliveryDay !== null && f.deliveryDay > gap.fromDay)) continue;
    }
    const type = ctx.types.get(ac.typeId);
    if (!type || !typeCanServe(a, b, type)) continue;
    if (layoutSeats(ac.layout) > type.maxSeats) continue;
    const rt = 2 * blockHours(distanceKm(a, b), type);
    if (rt > weeklyCapacityHours(type)) continue;
    const res = schedAt(state, fleet, day, [ac.id, route.id]);
    const gained = res.routes[route.id]!.scheduledFrequency - baseRoute.scheduledFrequency;
    if (gained < 1) continue;
    const flownBefore = (base.aircraft[ac.id]?.assignments ?? []).filter((x) => x.routeId !== route.id);
    const lostElsewhere = state.world.routes
      .filter((rt2) => rt2.id !== route.id)
      .reduce((s, rt2) => s + Math.max(0, (base.routes[rt2.id]?.scheduledFrequency ?? 0) - (res.routes[rt2.id]?.scheduledFrequency ?? 0)), 0);
    const sameType = type.id === reqType.id;
    const sameSizeClass = type.widebody === reqType.widebody;
    const idle = (base.aircraft[ac.id]?.blockHoursPerWeek ?? 0) < 1e-9;
    const isReserved = reserved[ac.id] === true;
    const seats = layoutSeats(ac.layout);
    const notes: string[] = [];
    if (isReserved) notes.push("Reserved spare.");
    else if (idle) notes.push("Idle today.");
    if (lostElsewhere > 0) {
      const names = state.world.routes.filter((r2) => r2.id !== route.id && (base.routes[r2.id]?.scheduledFrequency ?? 0) > (res.routes[r2.id]?.scheduledFrequency ?? 0)).map((r2) => `${r2.origin}-${r2.destination}`);
      notes.push(`Takes ${lostElsewhere}/wk round trips off ${names.join(", ")}.`);
    } else if (flownBefore.length > 0) notes.push("Has spare time on its current routes.");
    if (!sameType) notes.push(sameSizeClass ? `Different type (${type.id}, ${reqType.id} requested).` : `Different size class (${type.widebody ? "widebody" : "narrowbody"} on a ${reqType.widebody ? "widebody" : "narrowbody"} route).`);
    if (baselineSeats > 0 && Math.abs(seats - baselineSeats) / baselineSeats > 0.1) {
      notes.push(`Cabin differs: ${seats} seats vs ${baselineSeats} on the usual aircraft.`);
    } else if (causeAc && ac.typeId === causeAc.typeId && JSON.stringify(classMix(ac)) !== JSON.stringify(classMix(causeAc))) {
      notes.push("Same type, different cabin mix.");
    }
    const cover = Math.min(1, gained / Math.max(1, missing));
    const score = Math.round(
      (sameType ? 100 : sameSizeClass ? 60 : 20) + 30 * cover + (isReserved ? 25 : idle ? 15 : 0) - (lostElsewhere > 0 ? 25 : 0) - (notes.some((n) => n.startsWith("Cabin differs")) ? 8 : 0),
    );
    out.push({
      aircraftId: ac.id, routeId: route.id, gapId: gap.id, fromDay: gap.fromDay, toDay: gap.toDay, score, sameType, sameSizeClass,
      roundTripsPerWeek: gained, profitDeltaPerWeek: 0, seats, baselineSeats, notes,
    });
  }
  // Profit deltas are costly (a route simulation each): only for the best few by the cheap score.
  const ranked = out.sort((x, y) => y.score - x.score || (x.aircraftId < y.aircraftId ? -1 : 1)).slice(0, Math.max(limit * 2, 8));
  for (const c of ranked) {
    const res = schedAt(state, fleet, day, [c.aircraftId, route.id]);
    let delta = 0;
    for (const rt of state.world.routes) {
      if (!changed(base.routes[rt.id], res.routes[rt.id])) continue;
      if (!baseProfits.has(rt.id)) baseProfits.set(rt.id, routeProfit(base, rt));
      delta += routeProfit(res, rt) - baseProfits.get(rt.id)!;
    }
    c.profitDeltaPerWeek = Math.round(delta);
  }
  return ranked
    .sort((x, y) => y.score - x.score || y.profitDeltaPerWeek - x.profitDeltaPerWeek || (x.aircraftId < y.aircraftId ? -1 : 1))
    .slice(0, limit);
}

export type { DowntimeWindow };
