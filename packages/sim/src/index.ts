import type {
  Aircraft, AircraftType, Airport, FinanceSnapshot, Id, Route, SimEvent, WorldState,
} from "@arg/contracts";
import { monthlyOwnershipUsd } from "./finance/ledger";
import { simulateRouteWeek } from "./route/routeModel";
import { evaluateLiveRoutes } from "./route/liveModel";
import { makeRng, mixSeed } from "./rng";
import { checkCostUsd, checkEndDay, dueCheck, initialMeta, MAINTENANCE_PARAMS, maintenanceEnabled, resetAfterCheck } from "./fleet/maintenance";
import { FINANCING_PARAMS, isRetired, LIFECYCLE_PARAMS, obsolescenceMultiplier } from "./fleet/lifecycle";
import { assign, DEFAULT_HOME_HUB } from "./fleet/scheduler";
import { homeHubOf } from "./fleet/hubs";
import { diversityOf } from "./fleet/diversity";
import { plannerPrefs } from "./planner/forecast";
import { evaluateNetwork } from "./route/network";
import { pushEvents } from "./commands";
import { playerHubs } from "./route/farePolicy";
import { weeklySlotFees } from "./route/congestion";
import { stepOffers } from "./offers";
import { airportOpen, closureOf, dayLabel } from "./world/closures";
import { isBankrupt, overdraftInterestUsd, stepCredit } from "./finance/credit";
import { rivalItinerariesFor, stepRivals } from "./rivals";
import { DEFAULT_SIM_PARAMS, type AircraftMeta, type CheckKind, type RouteReport, type SimParams, type SimState } from "./state";

export { makeRng };
export * from "./demand/market";
export * from "./demand/metros";
export * from "./demand/choice";
export * from "./demand/fares";
export * from "./world/regions";
export * from "./world/closures";
export * from "./finance/ledger";
export * from "./finance/fuel";
export * from "./finance/credit";
export * from "./time/clock";
export * from "./time/calendar";
export { distanceKm, haversineKm } from "./geo";
export {
  simulateRouteWeek, routeAircraftNeed, cabinsFor, DEFAULT_ROUTE_MODEL_CONFIG, ROUTE_CHOICE_PARAMS,
  evaluateHubConnection, networkContribution, fareScaleForTargetLoadFactor, scaleFares, TARGET_LOAD_FACTOR_RANGE,
} from "./route/routeModel";
export type {
  RouteWeek, RouteModelConfig, RouteWeekOptions, HubConnection, HubConnectionInput, NetworkContribution,
} from "./route/routeModel";

export * from "./state";
export * from "./route/network";
export * from "./route/farePolicy";
export * from "./route/congestion";
export * from "./route/liveModel";
export * from "./route/loads";
export * from "./cabin/experience";
export { fleetGroups, averageSeats, evaluateWithFleet } from "./route/routeModel";
export type { FleetGroup } from "./route/routeModel";
export * from "./commands";
export * from "./fleet/hubs";
export * from "./fleet/diversity";
export * from "./fleet/disposal";
export * from "./scenario";
export * from "./offers";
export * from "./cabin";
export * from "./fleet/layout";
export * from "./fleet/maintenance";
export * from "./fleet/lifecycle";
export * from "./fleet/availability";
export * from "./time/startYear";
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
  const home = start.baseAirport ?? DEFAULT_HOME_HUB;
  world.fleet = (start.fleet ?? []).map((ac) => ({ ...ac, layout: ac.layout, hoursSinceCheck: { ...ac.hoursSinceCheck }, hubId: ac.hubId ?? home }));
  world.routes = (start.routes ?? []).map((r) => ({ ...r, fares: { ...r.fares } }));
  if (start.baseAirport) world.homeHub = start.baseAirport;
  world.ownedHubs = [home];
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

  // Bankruptcy ends the game: the sim no longer advances (the UI shows the game-over screen).
  if (isBankrupt(state)) return state;
  state = closeRoutesAtClosedAirports(state);
  let { world } = state;
  const { params } = state;
  const day = world.day;
  const maint = maintenanceEnabled();
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const rng = makeRng(mixSeed(world.seed, day));
  const notices: SimEvent[] = [];
  const say = (text: string) => notices.push({ kind: "notice", day, text });
  const ctx = { airports, types, prefs: plannerPrefs(state, day), homeHub: homeHubOf(state) };

  // Work on private copies so the input state is never modified.
  let fleet: Aircraft[] = world.fleet.map((ac) => ({ ...ac, hoursSinceCheck: { ...ac.hoursSinceCheck } }));
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
      // Purchase: the balance of the net price is paid at delivery. Lease: nothing due now (payments accrue from delivery).
      // Offer/legacy orders (no financing): the deposit is credited back as before.
      if (order?.financing === "purchase") cashAdjust -= (order.unitPriceUsd * (1 - FINANCING_PARAMS.purchaseDownFraction));
      else if (order && order.financing === undefined) cashAdjust += order.depositUsd / order.count;
      m.deliveryDay = null;
      say(`Delivered ${ac.tailNumber} (${ac.typeId})${order ? ` from ${order.id}` : ""}.`);
    }
  }

  // 2. Heavy checks that finish today.
  for (const ac of byId) {
    const m = meta[ac.id]!;
    // With maintenance switched off, an aircraft left in a check by an older save returns at once; refits still run their course.
    if (!maint && ac.status === "maintenance" && m.maintenance && !m.maintenance.refit) {
      m.maintenance = null;
      ac.status = "active";
      say(`${ac.tailNumber} (${ac.typeId}) is back in service (maintenance checks are suspended).`);
    } else if (ac.status === "maintenance" && m.maintenance && m.maintenance.endDay <= day) {
      say(m.maintenance.refit ? `${ac.tailNumber} (${ac.typeId}) is back in service with its new cabin.` : `${ac.tailNumber} (${ac.typeId}) is back in service after its ${m.maintenance.check} check.`);
      m.maintenance = null;
      ac.status = "active";
    }
  }

  // 3. Checks that fall due. A checks happen overnight (cost, no downtime). Heavier checks are deferred
  //    (up to the grace period) when pulling the aircraft would leave scheduled flights uncovered.
  let baseline: number | null = null;
  for (const ac of maint ? byId : []) {
    const m = meta[ac.id]!;
    if (ac.status !== "active") continue;
    const kind = dueCheck(ac, m);
    if (!kind) continue;
    const type = types.get(ac.typeId);
    if (!type) continue;
    const cost = checkCostUsd(type, kind) * obsolescenceMultiplier(type, day);
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

  // 4. Schedule the active fleet onto routes and simulate every route (with hub connecting traffic): the shared live model.
  const live = evaluateLiveRoutes({
    routes: world.routes, fleet, airports, types, day, notionalFleet: params.notionalFleet, rivals: state.rivals, prefs: ctx.prefs, homeHub: ctx.homeHub,
    noise: () => 1 + (rng() - 0.5) * params.demandNoise,
    // Weekly step: routes with a target load factor are re-priced before they are simulated (see liveModel).
    solveFares: day % 7 === 0,
    farePolicies: world.farePolicies,
    hubs: playerHubs(state),
  });
  const { schedule, reports } = live;
  if (Object.keys(live.solvedFares).length > 0) {
    world = { ...world, routes: world.routes.map((r) => (live.solvedFares[r.id] ? { ...r, fares: live.solvedFares[r.id]! } : r)) };
  }
  const revenue = live.revenue;
  const routeCosts = live.routeCosts;
  for (const route of world.routes) {
    const rep = reports[route.id];
    if (!rep) continue;
    const sched = rep.scheduling;
    const prev = state.routeReports[route.id]?.scheduling;
    if (sched) {
      const before = prev?.underSupplied ?? 0;
      if (sched.underSupplied > 0 && before === 0) {
        say(`${route.origin}-${route.destination} is under-supplied: ${sched.scheduledFrequency} of ${route.weeklyFrequency} weekly round trips can be flown.`);
      } else if (sched.underSupplied === 0 && before > 0) {
        say(`${route.origin}-${route.destination} is back to its full ${route.weeklyFrequency}/wk schedule.`);
      }
    }
  }

  // 5. Utilisation: flight hours and cycles from the schedule, calendar counters, ageing.
  for (const ac of fleet) {
    const m = meta[ac.id]!;
    const load = schedule.aircraft[ac.id];
    const hours = load ? load.blockHoursPerWeek / 7 : 0;
    const cycles = load ? load.assignments.reduce((s, a) => s + (2 * a.roundTrips) / 7, 0) : 0;
    m.flightHours += hours;
    m.cycles += cycles;
    if (maint) for (const k of ["A", "B", "C", "D"] as CheckKind[]) ac.hoursSinceCheck[k] += hours;
    if (ac.status !== "delivery") {
      if (maint && ac.status !== "maintenance") for (const k of ["B", "C", "D"] as const) m.daysSince[k] += 1;
      ac.ageDays += 1;
    }
  }

  // 5b. Hard lifespan: aircraft reaching the cap leave the fleet (and their order lists) today.
  const retiredIds = new Set<Id>();
  for (const ac of fleet) {
    if (ac.status === "delivery" || !isRetired(ac)) continue;
    retiredIds.add(ac.id);
    delete meta[ac.id];
    say(`${ac.tailNumber} (${ac.typeId}) reached the ${LIFECYCLE_PARAMS.maxAgeYears}-year age limit and has been retired.`);
  }

  // 6. Fleet-level costs: lease for every delivered aircraft whether or not it flies, plus overhead and checks.
  // Slot and terminal fees (route/congestion.ts): weekly total / 7, a company-level line next to overhead.
  let fleetCost = params.corporateOverheadPerDay + checkCosts + weeklySlotFees(state).total / 7;
  const priceFactor = new Map(state.orders.flatMap((o) => (o.ownershipFactor === undefined ? [] : o.aircraftIds.map((id) => [id, o.ownershipFactor!] as const))));
  const orderFinancing = new Map(state.orders.flatMap((o) => o.financing === undefined ? [] : o.aircraftIds.map((id) => [id, o.financing!] as const)));
  for (const ac of fleet) {
    if (ac.status === "delivery" || retiredIds.has(ac.id)) continue;
    const t = types.get(ac.typeId);
    if (!t) continue;
    const financing = ac.financing ?? orderFinancing.get(ac.id);
    // Purchased aircraft are paid for in cash (no lease-equivalent). Leased and pre-economics aircraft pay the lease-equivalent.
    if (financing === "purchase") {
      fleetCost += params.overheadPerAircraftPerDay;
      continue;
    }
    const lease = monthlyOwnershipUsd(t) * (priceFactor.get(ac.id) ?? 1) * obsolescenceMultiplier(t, day);
    const overhead = params.overheadPerAircraftPerDay * (financing === "lease" ? 1 + FINANCING_PARAMS.leaseOperatingUplift : 1);
    fleetCost += lease / 30.4375 + overhead;
  }
  // Fleet commonality: every aircraft type beyond the free allowance adds crew-training, spares and ops overhead (fleet/diversity.ts).
  const diversity = diversityOf(fleet.filter((ac) => !retiredIds.has(ac.id)));
  fleetCost += diversity.dailyUsd;
  // Overdraft interest on the cash balance at the start of the day (credit line, finance/credit.ts); a company-level cost.
  const interest = overdraftInterestUsd(world.cash);
  const costs = routeCosts + fleetCost + interest;
  const profit = revenue - costs;
  const cash = world.cash + profit + cashAdjust;
  const snapshot: FinanceSnapshot = { day, cash, revenue, costs, profit };

  const snapshots = state.snapshots.length >= params.snapshotHistory
    ? [...state.snapshots.slice(state.snapshots.length - params.snapshotHistory + 1), snapshot]
    : [...state.snapshots, snapshot];

  const events: SimEvent[] = [{ kind: "tick", day: day + 1 }, { kind: "finance", snapshot }];
  const next: SimState = {
    ...state,
    world: { ...world, day: day + 1, cash, fleet: fleet.filter((ac) => !retiredIds.has(ac.id)) },
    orders: retiredIds.size === 0 ? state.orders : state.orders.map((o) => {
      const keep = o.aircraftIds.map((id) => !retiredIds.has(id));
      return keep.every(Boolean) ? o : { ...o, aircraftIds: o.aircraftIds.filter((_, i) => keep[i]), deliveryDays: o.deliveryDays.filter((_, i) => keep[i]) };
    }),
    snapshots,
    routeReports: reports,
    events,
    fleetMeta: meta,
    // Absent until the overhead is first charged, so airlines inside the free type allowance keep a byte-identical state.
    ...(diversity.dailyUsd > 0 || state.diversity
      ? { diversity: { lastUsd: diversity.dailyUsd, totalUsd: (state.diversity?.totalUsd ?? 0) + diversity.dailyUsd } }
      : {}),
  };
  const credit = stepCredit(state, next, interest);
  const done: SimState = credit.credit === next.credit ? next : { ...next, credit: credit.credit };
  const frozen: SimState = credit.bankrupt ? { ...done, speed: 0 } : done;
  const pushed = pushEvents(frozen, [...events, ...notices, ...credit.notices.map((text): SimEvent => ({ kind: "notice", day, text }))]);
  // A failed airline stops here: no more offers or rival moves.
  return credit.bankrupt ? pushed : stepOffers(stepRivals(pushed, day));
}

/**
 * Routes touching an airport that has closed (world/closures.ts; TXL, SXF, RYG, DSA in the data) are cancelled with a notice on the
 * closing day. Cheap (a handful of lookups a day) and also catches a save loaded after a closure.
 */
export function closeRoutesAtClosedAirports(state: SimState): SimState {
  const day = state.world.day;
  const shut = state.world.routes.filter((r) => !airportOpen(r.origin, day) || !airportOpen(r.destination, day));
  if (shut.length === 0) return state;
  const gone = new Set(shut.map((r) => r.id));
  const routeReports = Object.fromEntries(Object.entries(state.routeReports).filter(([id]) => !gone.has(id)));
  const notices: SimEvent[] = shut.map((r) => {
    const id = !airportOpen(r.origin, day) ? r.origin : r.destination;
    const c = closureOf(id);
    const name = state.airports.find((a) => a.id === id)?.name ?? id;
    return {
      kind: "notice", day,
      text: `${id} (${name}) ${c ? `closed on ${dayLabel(c.day)}` : "is not available"}: ${r.origin}-${r.destination} is cancelled${c?.replacedBy ? `. Traffic has moved to ${c.replacedBy}.` : "."}`,
    } as SimEvent;
  });
  return pushEvents({ ...state, world: { ...state.world, routes: state.world.routes.filter((r) => !gone.has(r.id)) }, routeReports }, notices);
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
