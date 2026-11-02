import type {
  Aircraft, AircraftType, Airport, FinanceSnapshot, Id, MarketSnapshot, SimEvent, WorldState,
} from "@arg/contracts";
import { monthlyOwnershipUsd, type RouteEvaluation } from "./finance/ledger";
import { routeAircraftNeed, simulateRouteWeek } from "./route/routeModel";
import { makeRng } from "./rng";

export { makeRng };
export * from "./demand/market";
export * from "./demand/choice";
export * from "./finance/ledger";
export * from "./finance/fuel";
export * from "./time/clock";
export * from "./time/calendar";
export { distanceKm, haversineKm } from "./geo";
export { simulateRouteWeek, routeAircraftNeed, cabinsFor, DEFAULT_ROUTE_MODEL_CONFIG } from "./route/routeModel";
export type { RouteWeek, RouteModelConfig, RouteWeekOptions } from "./route/routeModel";

// ---------------------------------------------------------------------------
// SimState: WorldState (from contracts) plus sim-internal state
// ---------------------------------------------------------------------------

/** Latest per-route result, for the UI "why" ledger. Weekly figures; the daily P&L is weekly / 7. */
export interface RouteReport {
  routeId: Id;
  day: number;
  evaluation: RouteEvaluation;
  market: MarketSnapshot;
  operatedFraction: number;
  /** True when the player owns no aircraft of the route's type, so ownership is notionally leased. */
  notionalFleet: boolean;
}

export interface SimParams {
  /** Corporate overhead per day, USD. */
  corporateOverheadPerDay: number;
  /** Extra overhead per owned aircraft per day (crew base, hangar, insurance). */
  overheadPerAircraftPerDay: number;
  /** Demand noise amplitude (peak-to-peak fraction). */
  demandNoise: number;
  /** How many daily snapshots to keep. */
  snapshotHistory: number;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  corporateOverheadPerDay: 8000,
  overheadPerAircraftPerDay: 600,
  demandNoise: 0.03,
  snapshotHistory: 800,
};

export interface SimState {
  world: WorldState;
  airports: Airport[];
  aircraftTypes: AircraftType[];
  params: SimParams;
  /** Rolling history of daily snapshots (oldest first). */
  snapshots: FinanceSnapshot[];
  routeReports: Record<Id, RouteReport>;
  /** Events emitted by the most recent step. */
  events: SimEvent[];
}

export function newWorld(seed: number): WorldState {
  return { seed, day: 0, playerId: "player", cash: 100_000_000, routes: [], fleet: [] };
}

export function newSim(
  seed: number,
  airports: Airport[],
  aircraftTypes: AircraftType[],
  params: Partial<SimParams> = {},
): SimState {
  return {
    world: newWorld(seed),
    airports,
    aircraftTypes,
    params: { ...DEFAULT_SIM_PARAMS, ...params },
    snapshots: [],
    routeReports: {},
    events: [],
  };
}

function isSimState(s: WorldState | SimState): s is SimState {
  return "world" in s;
}

function mixSeed(seed: number, day: number): number {
  let h = (seed ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

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

  // Fleet capacity by type, shared across that type's routes.
  const fleetByType = new Map<Id, Aircraft[]>();
  for (const ac of world.fleet) {
    if (ac.status !== "active") continue;
    const list = fleetByType.get(ac.typeId) ?? [];
    list.push(ac);
    fleetByType.set(ac.typeId, list);
  }
  const needByType = new Map<Id, number>();
  for (const r of world.routes) {
    needByType.set(r.typeId, (needByType.get(r.typeId) ?? 0) + routeAircraftNeed(r, airports, types));
  }

  let revenue = 0;
  let routeCosts = 0;
  const reports: Record<Id, RouteReport> = {};
  for (const route of world.routes) {
    const fleet = fleetByType.get(route.typeId) ?? [];
    const need = needByType.get(route.typeId) ?? 0;
    const notional = fleet.length === 0;
    const fraction = notional || need <= 0 ? 1 : Math.min(1, fleet.length / need);
    const noise = 1 + (rng() - 0.5) * params.demandNoise;
    const week = simulateRouteWeek(route, airports, types, day, {
      fleetAircraft: fleet,
      operatedFraction: fraction,
      demandScale: noise,
      chargeOwnership: notional,
    });
    if (!week) continue;
    revenue += week.evaluation.revenue / 7;
    routeCosts += week.evaluation.costs / 7;
    reports[route.id] = {
      routeId: route.id,
      day,
      evaluation: week.evaluation,
      market: week.snapshot,
      operatedFraction: fraction,
      notionalFleet: notional,
    };
  }

  // Fleet-level costs: lease for every owned aircraft whether or not it flies, plus overhead.
  let fleetCost = params.corporateOverheadPerDay;
  for (const ac of world.fleet) {
    const t = types.get(ac.typeId);
    if (t) fleetCost += monthlyOwnershipUsd(t) / 30.4375 + params.overheadPerAircraftPerDay;
  }
  const costs = routeCosts + fleetCost;
  const profit = revenue - costs;
  const cash = world.cash + profit;
  const snapshot: FinanceSnapshot = { day, cash, revenue, costs, profit };

  const snapshots = state.snapshots.length >= params.snapshotHistory
    ? [...state.snapshots.slice(state.snapshots.length - params.snapshotHistory + 1), snapshot]
    : [...state.snapshots, snapshot];

  return {
    ...state,
    world: {
      ...world,
      day: day + 1,
      cash,
      fleet: world.fleet.map((ac) => ({ ...ac, ageDays: ac.ageDays + 1 })),
    },
    snapshots,
    routeReports: reports,
    events: [{ kind: "tick", day: day + 1 }, { kind: "finance", snapshot }],
  };
}

/** Convenience: step `n` days. */
export function runDays(state: SimState, n: number): SimState {
  let s = state;
  for (let i = 0; i < n; i++) s = stepDay(s);
  return s;
}
