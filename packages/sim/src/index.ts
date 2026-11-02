import type {
  Aircraft, AircraftType, Airport, FinanceSnapshot, Id, Route, SimEvent, WorldState,
} from "@arg/contracts";
import { monthlyOwnershipUsd } from "./finance/ledger";
import { simulateRouteWeek } from "./route/routeModel";
import { makeRng, mixSeed } from "./rng";
import { checkCostUsd, checkEndDay, dueCheck, initialMeta, MAINTENANCE_PARAMS, resetAfterCheck } from "./fleet/maintenance";
import { assign } from "./fleet/scheduler";
import { plannerPrefs } from "./planner/forecast";
import { evaluateNetwork } from "./route/network";
import { pushEvents } from "./commands";
import { stepOffers } from "./offers";
import { rivalItinerariesFor, stepRivals } from "./rivals";
import { DEFAULT_SIM_PARAMS, type AircraftMeta, type CheckKind, type RouteReport, type SimParams, type SimState } from "./state";

export { makeRng };
export * from "./demand/market";
export * from "./demand/metros";
export * from "./demand/choice";
export * from "./finance/ledger";
export * from "./finance/fuel";
export * from "./time/clock";
export * from "./time/calendar";
export { distanceKm, haversineKm } from "./geo";
export {
  simulateRouteWeek, routeAircraftNeed, cabinsFor, DEFAULT_ROUTE_MODEL_CONFIG, ROUTE_CHOICE_PARAMS,
  evaluateHubConnection, networkContribution,
} from "./route/routeModel";
export type {
  RouteWeek, RouteModelConfig, RouteWeekOptions, HubConnection, HubConnectionInput, NetworkContribution,
} from "./route/routeModel";

export * from "./state";
export * from "./route/network";
export * from "./commands";
export * from "./scenario";
export * from "./offers";
export * from "./cabin";
export * from "./fleet/layout";
export * from "./fleet/maintenance";
export * from "./fleet/scheduler";
export { mixSeed } from "./rng";
export * from "./rivals";
export * from "./serialize";
export * from "./planner";

export function newWorld(seed: number): WorldState {
  return { seed, day: 0, playerId: "player", cash: 100_000_000, routes: [], fleet: [] };
}

export interface StartOptions {
  cash?: number;
  fleet?: Aircraft[];
  routes?: Route[];
  airlineName?: string;
  baseAirport?: Id | null;
  day?: number;
}

export function newSim(
  seed: number,
  airports: Airport[],
  aircraftTypes: AircraftType[],
  params: Partial<SimParams> = {},
  start: StartOptions = {},
): SimState {
  const world = newWorld(seed);
  if (start.cash !== undefined) world.cash = start.cash;
  if (start.day !== undefined) world.day = start.day;
  world.fleet = (start.fleet ?? []).map((ac) => ({ ...ac, layout: ac.layout, hoursSinceCheck: { ...ac.hoursSinceCheck } }));
  world.routes = (start.routes ?? []).map((r) => ({ ...r, fares: { ...r.fares } }));
  const rng = makeRng(mixSeed(seed, 0x5eed));
  const fleetMeta: Record<Id, AircraftMeta> = {};
  for (const ac of world.fleet) fleetMeta[ac.id] = initialMeta(ac, rng);
  return {
    world,
    airports,
    aircraftTypes,
    params: { ...DEFAULT_SIM_PARAMS, ...params },
    airlineName: start.airlineName ?? "Player Airline",
    baseAirport: start.baseAirport ?? null,
    speed: 0,
    snapshots: [],
    routeReports: {},
    events: [],
    pendingEvents: [],
    fleetMeta,
    orders: [],
    offers: [],
    offerLog: {},
    rivals: null,
    bankruptcies: [],
    counters: { route: world.routes.length, aircraft: world.fleet.length, order: 0 },
  };
}


function isSimState(s: WorldState | SimState): s is SimState {
  return "world" in s;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Advance a bare world one day (no economy; kept for callers that have no airport data). */
export function stepDay(state: WorldState): WorldState;
/** Advance a full sim one day, producing a FinanceSnapshot from route economics. Pure. */
export function stepDay(state: SimState): SimState;
export function stepDay(state: WorldState | SimState): WorldState | SimState {
  if (!isSimState(state)) return { ...state, day: state.day + 1 };

  const { world, params } = state;
  const day = world.day;
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const rng = makeRng(mixSeed(world.seed, day));
  const notices: SimEvent[] = [];
  const say = (text: string) => notices.push({ kind: "notice", day, text });
  const ctx = { airports, types, prefs: plannerPrefs(state, day) };

  // Work on private copies so the input state is never modified.
  const fleet: Aircraft[] = world.fleet.map((ac) => ({ ...ac, hoursSinceCheck: { ...ac.hoursSinceCheck } }));
  const meta: Record<Id, AircraftMeta> = {};
  for (const ac of fleet) {
    const m = state.fleetMeta[ac.id] ?? initialMeta(ac, makeRng(mixSeed(world.seed, 977 + fleet.indexOf(ac))));
    meta[ac.id] = { ...m, daysSince: { ...m.daysSince }, intervals: { ...m.intervals } };
  }
  const byId = [...fleet].sort((x, y) => cmp(x.id, y.id));
  let cashAdjust = 0;
  let checkCosts = 0;

  // 1. Deliveries: the deposit is credited back as the aircraft joins the financed fleet.
  for (const ac of byId) {
    const m = meta[ac.id]!;
    if (ac.status === "delivery" && m.deliveryDay !== null && m.deliveryDay <= day) {
      ac.status = "active";
      ac.ageDays = 0;
      const order = state.orders.find((o) => o.id === m.orderId);
      ac.ageDays = order?.ageDays ?? 0;
      if (order) cashAdjust += order.depositUsd / order.count;
      m.deliveryDay = null;
      say(`Delivered ${ac.tailNumber} (${ac.typeId})${order ? ` from ${order.id}` : ""}.`);
    }
  }

  // 2. Heavy checks that finish today.
  for (const ac of byId) {
    const m = meta[ac.id]!;
    if (ac.status === "maintenance" && m.maintenance && m.maintenance.endDay <= day) {
      say(m.maintenance.refit ? `${ac.tailNumber} (${ac.typeId}) is back in service with its new cabin.` : `${ac.tailNumber} (${ac.typeId}) is back in service after its ${m.maintenance.check} check.`);
      m.maintenance = null;
      ac.status = "active";
    }
  }

  // 3. Checks that fall due. A checks happen overnight (cost, no downtime). Heavier checks are deferred
  //    (up to the grace period) when pulling the aircraft would leave scheduled flights uncovered.
  let baseline: number | null = null;
  for (const ac of byId) {
    const m = meta[ac.id]!;
    if (ac.status !== "active") continue;
    const kind = dueCheck(ac, m);
    if (!kind) continue;
    const type = types.get(ac.typeId);
    if (!type) continue;
    const cost = checkCostUsd(type, kind);
    if (kind === "A") {
      checkCosts += cost;
      resetAfterCheck(ac, m, "A");
      say(`${ac.tailNumber} A check done overnight ($${Math.round(cost / 1000)}k).`);
      continue;
    }
    if (m.deferredDays < MAINTENANCE_PARAMS.graceDays && world.routes.length > 0) {
      baseline ??= baselineTotalsWith(world.routes, fleet, ctx);
      ac.status = "maintenance";
      const without = baselineTotalsWith(world.routes, fleet, ctx);
      ac.status = "active";
      if (without < baseline) {
        if (m.deferredDays === 0) say(`${ac.tailNumber} ${kind} check is due but no spare aircraft can cover it; deferring up to ${MAINTENANCE_PARAMS.graceDays} days.`);
        m.deferredDays += 1;
        continue;
      }
    }
    const down = MAINTENANCE_PARAMS.downtimeDays[kind];
    ac.status = "maintenance";
    m.maintenance = { check: kind, startDay: day, endDay: checkEndDay(kind, day), cost };
    m.deferredDays = 0;
    resetAfterCheck(ac, m, kind);
    checkCosts += cost;
    baseline = null; // the active set changed
    say(`${ac.tailNumber} (${ac.typeId}) enters ${kind} check for ${down} days ($${(cost / 1e6).toFixed(2)}M).`);
  }

  // 4. Schedule the active fleet onto routes.
  const schedule = assign(world.routes, fleet, ctx);
  const fleetById = new Map(fleet.map((ac) => [ac.id, ac]));
  const ownedTypes = new Set(fleet.filter((ac) => ac.status !== "delivery").map((ac) => ac.typeId));

  let revenue = 0;
  let routeCosts = 0;
  const reports: Record<Id, RouteReport> = {};
  const weeks: Record<Id, NonNullable<ReturnType<typeof simulateRouteWeek>>> = {};
  const routeFleet: Record<Id, Aircraft[]> = {};
  const routeFraction: Record<Id, number> = {};
  for (const route of world.routes) {
    const notional = params.notionalFleet && !ownedTypes.has(route.typeId);
    const sched = schedule.routes[route.id];
    const fraction = notional || !sched ? 1 : sched.scheduledFrequency / route.weeklyFrequency;
    const flying = sched ? sched.aircraftIds.map((id) => fleetById.get(id)!).filter(Boolean) : [];
    const layoutSource = flying.length > 0 ? flying : fleet.filter((ac) => ac.typeId === route.typeId && ac.status !== "delivery");
    const noise = 1 + (rng() - 0.5) * params.demandNoise;
    const week = simulateRouteWeek(route, airports, types, day, {
      fleetAircraft: notional ? [] : layoutSource,
      operatedFraction: fraction,
      demandScale: noise,
      chargeOwnership: notional,
      rivalItineraries: rivalItinerariesFor(state.rivals, airports.get(route.origin)!, airports.get(route.destination)!, types),
    });
    if (!week) continue;
    weeks[route.id] = week;
    routeFleet[route.id] = notional ? [] : layoutSource;
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
      scheduling: notional ? null : sched ?? null,
    };
    const prev = state.routeReports[route.id]?.scheduling;
    if (!notional && sched) {
      const before = prev?.underSupplied ?? 0;
      if (sched.underSupplied > 0 && before === 0) {
        say(`${route.origin}-${route.destination} is under-supplied: ${sched.scheduledFrequency} of ${route.weeklyFrequency} weekly round trips can be flown.`);
      } else if (sched.underSupplied === 0 && before > 0) {
        say(`${route.origin}-${route.destination} is back to its full ${route.weeklyFrequency}/wk schedule.`);
      }
    }
  }

  // 4b. Hub connecting passengers (SAN-HNL via LAX ...): extra revenue and cost on the legs, load factors updated.
  const net = evaluateNetwork({ routes: world.routes, airports, types, day, weeks, fleet: routeFleet, operatedFraction: routeFraction });
  revenue += net.deltaRevenue / 7;
  routeCosts += net.deltaCosts / 7;
  for (const [id, evaluation] of Object.entries(net.evaluations)) {
    const rep = reports[id];
    if (rep) reports[id] = { ...rep, evaluation, connecting: net.connecting[id] };
  }

  // 5. Utilisation: flight hours and cycles from the schedule, calendar counters, ageing.
  for (const ac of fleet) {
    const m = meta[ac.id]!;
    const load = schedule.aircraft[ac.id];
    const hours = load ? load.blockHoursPerWeek / 7 : 0;
    const cycles = load ? load.assignments.reduce((s, a) => s + (2 * a.roundTrips) / 7, 0) : 0;
    m.flightHours += hours;
    m.cycles += cycles;
    for (const k of ["A", "B", "C", "D"] as CheckKind[]) ac.hoursSinceCheck[k] += hours;
    if (ac.status !== "delivery") {
      if (ac.status !== "maintenance") for (const k of ["B", "C", "D"] as const) m.daysSince[k] += 1;
      ac.ageDays += 1;
    }
  }

  // 6. Fleet-level costs: lease for every delivered aircraft whether or not it flies, plus overhead and checks.
  let fleetCost = params.corporateOverheadPerDay + checkCosts;
  const priceFactor = new Map(state.orders.flatMap((o) => (o.ownershipFactor === undefined ? [] : o.aircraftIds.map((id) => [id, o.ownershipFactor!] as const))));
  for (const ac of fleet) {
    if (ac.status === "delivery") continue;
    const t = types.get(ac.typeId);
    if (t) fleetCost += (monthlyOwnershipUsd(t) * (priceFactor.get(ac.id) ?? 1)) / 30.4375 + params.overheadPerAircraftPerDay;
  }
  const costs = routeCosts + fleetCost;
  const profit = revenue - costs;
  const cash = world.cash + profit + cashAdjust;
  const snapshot: FinanceSnapshot = { day, cash, revenue, costs, profit };

  const snapshots = state.snapshots.length >= params.snapshotHistory
    ? [...state.snapshots.slice(state.snapshots.length - params.snapshotHistory + 1), snapshot]
    : [...state.snapshots, snapshot];

  const events: SimEvent[] = [{ kind: "tick", day: day + 1 }, { kind: "finance", snapshot }];
  const next: SimState = {
    ...state,
    world: { ...world, day: day + 1, cash, fleet },
    snapshots,
    routeReports: reports,
    events,
    fleetMeta: meta,
  };
  return stepOffers(stepRivals(pushEvents(next, [...events, ...notices]), day));
}

/** Total scheduled round trips with the fleet as given (used to test whether pulling an aircraft loses flights). */
function baselineTotalsWith(routes: readonly Route[], fleet: readonly Aircraft[], ctx: Parameters<typeof assign>[2]): number {
  const r = assign(routes, fleet, ctx);
  return Object.values(r.routes).reduce((s, x) => s + x.scheduledFrequency, 0);
}

/** Convenience: step `n` days. */
export function runDays(state: SimState, n: number): SimState {
  let s = state;
  for (let i = 0; i < n; i++) s = stepDay(s);
  return s;
}
