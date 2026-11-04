import type { Aircraft, AircraftType, Airport, Day, Fares, Id, Route } from "@arg/contracts";
import { assign, type AssignPrefs, type ScheduleResult } from "../fleet/scheduler";
import { plannerPrefs } from "../planner/forecast";
import { homeHubOf } from "../fleet/hubs";
import { rivalItinerariesFor } from "../rivals";
import type { RivalsState } from "../rivals/types";
import type { RouteReport, SimState } from "../state";
import { dayToDate, daysInMonth } from "../time/calendar";
import { evaluateNetwork } from "./network";
import { simulateRouteWeek, type RouteWeek } from "./routeModel";
import type { RouteEvaluation } from "../finance/ledger";

export interface LiveModelInput {
  routes: readonly Route[];
  fleet: readonly Aircraft[];
  airports: ReadonlyMap<string, Airport>;
  types: ReadonlyMap<string, AircraftType>;
  day: Day;
  notionalFleet: boolean;
  rivals: RivalsState | null;
  prefs: AssignPrefs | undefined;
  /** Home hub for aircraft without a base (fleet/hubs.ts). */
  homeHub?: Id;
  /** Demand noise factor for a route; called once per route in route order (the daily step draws it from its rng). */
  noise: (route: Route) => number;
}

export interface LiveModelResult {
  schedule: ScheduleResult;
  reports: Record<Id, RouteReport>;
  weeks: Record<Id, RouteWeek>;
  /** Daily totals over the routes (weekly / 7), before fleet-level costs. */
  revenue: number;
  routeCosts: number;
}

/**
 * The one route model the game runs every day and every forecast reuses: schedule the fleet onto the routes, simulate each route
 * with the aircraft actually assigned (mixed types weighted by the round trips each flies), the modelled rivals, then add hub
 * connecting traffic. `stepDay` and the previews below both call this, so a preview of an unchanged route is the live report.
 */
export function evaluateLiveRoutes(inp: LiveModelInput): LiveModelResult {
  const { routes, fleet, airports, types, day } = inp;
  const schedule = assign(routes, fleet, { airports, types, prefs: inp.prefs, homeHub: inp.homeHub });
  const fleetById = new Map(fleet.map((ac) => [ac.id, ac]));
  const ownedTypes = new Set(fleet.filter((ac) => ac.status !== "delivery").map((ac) => ac.typeId));
  const reports: Record<Id, RouteReport> = {};
  const weeks: Record<Id, RouteWeek> = {};
  const routeFleet: Record<Id, Aircraft[]> = {};
  const routeFlights: Record<Id, Record<Id, number>> = {};
  const routeFraction: Record<Id, number> = {};
  let revenue = 0;
  let routeCosts = 0;
  for (const route of routes) {
    const notional = inp.notionalFleet && !ownedTypes.has(route.typeId);
    const sched = schedule.routes[route.id];
    const fraction = notional || !sched ? 1 : sched.scheduledFrequency / route.weeklyFrequency;
    const flying = sched ? sched.aircraftIds.map((id) => fleetById.get(id)!).filter(Boolean) : [];
    const layoutSource = flying.length > 0 ? flying : fleet.filter((ac) => ac.typeId === route.typeId && ac.status !== "delivery");
    const noise = inp.noise(route);
    const a = airports.get(route.origin);
    const b = airports.get(route.destination);
    const flights = notional || flying.length === 0 ? undefined : sched?.roundTripsByAircraft;
    const week = a && b ? simulateRouteWeek(route, airports, types, day, {
      fleetAircraft: notional ? [] : layoutSource,
      fleetFlights: flights,
      operatedFraction: fraction,
      demandScale: noise,
      chargeOwnership: notional,
      rivalItineraries: rivalItinerariesFor(inp.rivals, a, b, types),
    }) : null;
    if (!week) continue;
    weeks[route.id] = week;
    routeFleet[route.id] = notional ? [] : layoutSource;
    if (flights) routeFlights[route.id] = flights;
    routeFraction[route.id] = fraction;
    revenue += week.evaluation.revenue / 7;
    routeCosts += week.evaluation.costs / 7;
    reports[route.id] = {
      routeId: route.id,
      day,
      evaluation: week.evaluation,
      market: week.snapshot,
      operatedFraction: fraction,
      notionalFleet: notional,
      demandScale: noise,
      scheduling: notional ? null : sched ?? null,
    };
  }
  // Hub connecting passengers (SAN-HNL via LAX ...): extra revenue and cost on the legs, load factors updated.
  const net = evaluateNetwork({ routes, airports, types, day, weeks, fleet: routeFleet, flights: routeFlights, operatedFraction: routeFraction });
  revenue += net.deltaRevenue / 7;
  routeCosts += net.deltaCosts / 7;
  for (const [id, evaluation] of Object.entries(net.evaluations)) {
    const rep = reports[id];
    if (rep) reports[id] = { ...rep, evaluation, connecting: net.connecting[id] };
  }
  return { schedule, reports, weeks, revenue, routeCosts };
}

// ---------------------------------------------------------------------------
// Forecasts: the live model with a change applied
// ---------------------------------------------------------------------------

/** What a player can change on a route in the inspector. */
export interface RoutePatch {
  fares?: Fares;
  weeklyFrequency?: number;
  typeId?: Id;
}

/** The figures a preview compares. Weekly USD, both directions. */
export interface PreviewFigures {
  profit: number;
  revenue: number;
  costs: number;
  loadFactor: number;
  passengersPerWeek: number;
  seatsPerWeek: number;
  seatsPerFlight: number;
  flightsPerWeek: number;
  aircraftEquivalent: number;
  feasible: boolean;
  infeasibleReasons: string[];
}

const figures = (e: RouteEvaluation): PreviewFigures => ({
  profit: e.profit, revenue: e.revenue, costs: e.costs, loadFactor: e.loadFactor, passengersPerWeek: e.passengersPerWeek,
  seatsPerWeek: e.seatsPerWeek, seatsPerFlight: e.seatsPerFlight, flightsPerWeek: e.flightsPerWeek,
  aircraftEquivalent: e.aircraftEquivalent, feasible: e.feasible, infeasibleReasons: e.infeasibleReasons,
});

export interface RoutePreview {
  routeId: Id;
  /** The day the live report (and so the preview) is for. */
  day: Day;
  /** Where "current" comes from: the live report from the daily step, or the model run on demand when the route has no report yet. */
  source: "live" | "model";
  /** The live route result: exactly what the route report shows. */
  current: PreviewFigures;
  /** Current plus the effect of the change, with everything else held to the live context. An unchanged patch gives `current`. */
  proposed: PreviewFigures;
  /** Proposed minus current. */
  delta: { profit: number; revenue: number; costs: number; loadFactor: number; passengersPerWeek: number };
  /** Change in profit on the player's other routes (connecting traffic, aircraft shared with this route). */
  otherRoutesDelta: number;
  /** Largest effects on other routes, by absolute profit change. */
  otherRoutes: { routeId: Id; delta: number }[];
  /** Operating contribution = route revenue less route costs. Ownership of the owned fleet is charged at company level, not here. */
  ownershipIncluded: boolean;
  /** True when the change flips between owned-fleet and notional-fleet treatment (ownership cost enters or leaves the route figure). */
  ownershipTreatmentChanges: boolean;
  /** Live report profit minus the same model re-run today with no change (state drift since the report; 0 right after a step). */
  drift: number;
}

function liveInput(state: SimState, day: Day, routes: readonly Route[], noise: (r: Route) => number): LiveModelInput {
  return {
    routes,
    fleet: state.world.fleet,
    airports: new Map(state.airports.map((a) => [a.id, a])),
    types: new Map(state.aircraftTypes.map((t) => [t.id, t])),
    day,
    notionalFleet: state.params.notionalFleet,
    homeHub: homeHubOf(state),
    rivals: state.rivals,
    prefs: plannerPrefs(state, day),
    noise,
  };
}

const withPatch = (r: Route, p: RoutePatch): Route => ({
  ...r,
  fares: p.fares ?? r.fares,
  weeklyFrequency: p.weeklyFrequency ?? r.weeklyFrequency,
  typeId: p.typeId ?? r.typeId,
});

/**
 * "What happens if I change this route?" Runs the live model twice on the report's day, once as the network is and once with
 * `patch` applied to the route, with the same fleet, scheduler, rivals, hub traffic and demand noise as the daily step, and adds the
 * difference to the live report. So an unchanged patch equals the live report exactly, and a one-dollar fare change shows only
 * what that dollar does. Returns null for an unknown route.
 */
export function previewRoutePatch(state: SimState, routeId: Id, patch: RoutePatch): RoutePreview | null {
  const route = state.world.routes.find((r) => r.id === routeId);
  if (!route) return null;
  const live = state.routeReports[routeId];
  const day = live?.day ?? state.world.day;
  const noiseOf = (id: Id) => state.routeReports[id]?.demandScale ?? 1;
  const baseRoutes = state.world.routes;
  const patched = baseRoutes.map((r) => (r.id === routeId ? withPatch(r, patch) : r));
  const base = evaluateLiveRoutes(liveInput(state, day, baseRoutes, (r) => noiseOf(r.id)));
  const next = evaluateLiveRoutes(liveInput(state, day, patched, (r) => noiseOf(r.id)));
  const b = base.reports[routeId], n = next.reports[routeId];
  if (!b || !n) return null;
  const cur = live?.evaluation ?? b.evaluation;
  const sub = (f: (e: RouteEvaluation) => number) => f(n.evaluation) - f(b.evaluation);
  const delta = {
    profit: sub((e) => e.profit), revenue: sub((e) => e.revenue), costs: sub((e) => e.costs),
    loadFactor: sub((e) => e.loadFactor), passengersPerWeek: sub((e) => e.passengersPerWeek),
  };
  const current = figures(cur);
  const proposed: PreviewFigures = {
    ...figures(n.evaluation),
    profit: cur.profit + delta.profit, revenue: cur.revenue + delta.revenue, costs: cur.costs + delta.costs,
    loadFactor: Math.max(0, cur.loadFactor + delta.loadFactor), passengersPerWeek: Math.max(0, cur.passengersPerWeek + delta.passengersPerWeek),
  };
  const others = Object.keys(base.reports)
    .filter((id) => id !== routeId && next.reports[id])
    .map((id) => ({ routeId: id, delta: next.reports[id]!.evaluation.profit - base.reports[id]!.evaluation.profit }))
    .filter((x) => Math.abs(x.delta) >= 1)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return {
    routeId,
    day,
    source: live ? "live" : "model",
    current,
    proposed,
    delta,
    otherRoutesDelta: others.reduce((s, x) => s + x.delta, 0),
    otherRoutes: others.slice(0, 5),
    ownershipIncluded: (live ?? b).notionalFleet,
    ownershipTreatmentChanges: b.notionalFleet !== n.notionalFleet,
    drift: live ? live.evaluation.profit - b.evaluation.profit : 0,
  };
}

/** Preview of a route the player has not opened yet, added to the live network (fleet, rivals, hub traffic as in the daily step). */
export function previewNewRoute(state: SimState, draft: Omit<Route, "id">, day: Day = state.world.day): {
  figures: PreviewFigures; ownershipIncluded: boolean; otherRoutesDelta: number; otherRoutes: { routeId: Id; delta: number }[];
  /** What the scheduler would assign (null for a notional fleet): which owned aircraft would fly it, and how many round trips. */
  scheduling: RouteReport["scheduling"];
  /** Share of the planned round trips the fleet can fly. */
  operatedFraction: number;
} | null {
  const id = "__preview__";
  const noiseOf = (rid: Id) => state.routeReports[rid]?.demandScale ?? 1;
  const base = evaluateLiveRoutes(liveInput(state, day, state.world.routes, (r) => noiseOf(r.id)));
  const next = evaluateLiveRoutes(liveInput(state, day, [...state.world.routes, { ...draft, id }], (r) => noiseOf(r.id)));
  const rep = next.reports[id];
  if (!rep) return null;
  const others = Object.keys(base.reports)
    .filter((rid) => next.reports[rid])
    .map((rid) => ({ routeId: rid, delta: next.reports[rid]!.evaluation.profit - base.reports[rid]!.evaluation.profit }))
    .filter((x) => Math.abs(x.delta) >= 1)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return {
    figures: figures(rep.evaluation), ownershipIncluded: rep.notionalFleet, scheduling: rep.scheduling, operatedFraction: rep.operatedFraction,
    otherRoutesDelta: others.reduce((s, x) => s + x.delta, 0), otherRoutes: others.slice(0, 5),
  };
}

/** Weekly route profit by month of the year containing `day`, from the live model on the 15th of each month (no daily noise). */
export function seasonalRouteProfit(state: SimState, routeId: Id, day: Day, patch: RoutePatch = {}): { month: number; weekly: number; monthly: number }[] {
  const cal = dayToDate(day);
  const jan1 = Math.floor(day) - cal.dayOfYear;
  const routes = state.world.routes.map((r) => (r.id === routeId ? withPatch(r, patch) : r));
  let offset = 0;
  const out: { month: number; weekly: number; monthly: number }[] = [];
  for (let month = 0; month < 12; month++) {
    const dim = daysInMonth(cal.year, month);
    const d = jan1 + offset + 14;
    offset += dim;
    const res = evaluateLiveRoutes(liveInput(state, d, routes, () => 1));
    const weekly = res.reports[routeId]?.evaluation.profit ?? 0;
    out.push({ month, weekly, monthly: weekly * (dim / 7) });
  }
  return out;
}
