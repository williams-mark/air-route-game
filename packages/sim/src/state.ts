import type {
  AircraftType, Airport, CabinLayout, Day, FinanceSnapshot, Id, MarketSnapshot, SimEvent, WorldState,
} from "@arg/contracts";
import type { RouteEvaluation } from "./finance/ledger";
import type { Offer } from "./offers/types";
import type { BankruptcyRecord, RivalsState } from "./rivals/types";
import type { RouteConnecting } from "./route/network";
import type { PlannerState } from "./planner/types";

// ---------------------------------------------------------------------------
// SimState: WorldState (from contracts) plus sim-internal state
// ---------------------------------------------------------------------------

export interface RouteScheduling {
  /** Round trips per week the scheduler actually covered (integer). */
  scheduledFrequency: number;
  /** Requested minus scheduled round trips per week ("under-supplied"). */
  underSupplied: number;
  /** Aircraft flying this route today, largest share first. */
  aircraftIds: Id[];
  /** Round trips covered by an aircraft of a different type than the route requested. */
  substitutedFrequency: number;
  /** Block hours per week this route uses across the fleet. */
  blockHoursPerWeek: number;
  /** Round trips per week each assigned aircraft flies on this route (aircraft id to count). Absent in older saves. */
  roundTripsByAircraft?: Record<Id, number>;
}

/** Latest per-route result, for the UI "why" ledger. Weekly figures; the daily P&L is weekly / 7. */
export interface RouteReport {
  routeId: Id;
  day: number;
  evaluation: RouteEvaluation;
  market: MarketSnapshot;
  operatedFraction: number;
  /** True when the player owns no aircraft of the route's type, so ownership is notionally leased. */
  notionalFleet: boolean;
  /** Demand noise factor applied to this report's day (1 = none). Lets forecasts reuse the same day. Absent in older saves. */
  demandScale?: number;
  /** Scheduler outcome; null in notional-fleet mode (no real aircraft to schedule). */
  scheduling: RouteScheduling | null;
  /** Connecting (hub) passengers carried on this route and already included in `evaluation`; absent when there are none. */
  connecting?: RouteConnecting;
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
  /**
   * When true (sandbox default), a route whose type the player owns none of is flown by a notional,
   * fractionally leased fleet. Scenarios set this false so unowned types simply cannot fly.
   */
  notionalFleet: boolean;
  /** Cap on queued (undrained) events. Oldest are dropped first. */
  eventQueueLimit: number;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  corporateOverheadPerDay: 8000,
  overheadPerAircraftPerDay: 600,
  demandNoise: 0.03,
  snapshotHistory: 800,
  notionalFleet: true,
  eventQueueLimit: 2000,
};

export type CheckKind = "A" | "B" | "C" | "D";

/** Sim-internal per-aircraft bookkeeping that the shared Aircraft contract has no room for. */
export interface AircraftMeta {
  flightHours: number;
  cycles: number;
  /** Calendar days since each check level was last done. */
  daysSince: Record<CheckKind, number>;
  /** Per-aircraft check intervals (days for B/C/D, flight hours for A). */
  intervals: Record<CheckKind, number>;
  /** Set while the aircraft is in a heavy check. */
  maintenance: { check: CheckKind; startDay: Day; endDay: Day; cost: number; refit?: boolean } | null;
  /** Day a status 'delivery' aircraft joins the fleet. */
  deliveryDay: Day | null;
  /** Order that produced it (if any). */
  orderId: Id | null;
  /** Days an overdue heavy check has been deferred for scheduling. */
  deferredDays: number;
}

export interface AircraftOrder {
  id: Id;
  typeId: Id;
  count: number;
  layout: CabinLayout;
  orderDay: Day;
  /** Discount off list, 0..1. */
  discount: number;
  /** Net price per aircraft, USD. */
  unitPriceUsd: number;
  /** Deposit paid at order time, USD (total). */
  depositUsd: number;
  /** Aircraft created for the order (status 'delivery' until their delivery day). */
  aircraftIds: Id[];
  deliveryDays: Day[];
  /** Offer this order came from (offers lane). */
  offerId?: Id;
  /** Age of the aircraft on arrival, days (used and distressed lots). Default 0. */
  ageDays?: number;
  /** Purchase or lease (economics orders). Absent = offer/legacy order: deposit credited back at delivery, lease-equivalent charged. */
  financing?: "purchase" | "lease";
  /** Net price / list price; scales the ownership (lease-equivalent) cost of these aircraft. Offer orders only. */
  ownershipFactor?: number;
  /** Launch orders: chance of a delivery slip, its longest length, whether it has been rolled, and the slip applied. */
  delayRisk?: number;
  maxDelayMonths?: number;
  delayResolved?: boolean;
  delayDays?: Day;
}

export interface SimState {
  world: WorldState;
  airports: Airport[];
  aircraftTypes: AircraftType[];
  params: SimParams;
  /** Display name of the player's airline. */
  airlineName: string;
  /** Home hub airport id. */
  baseAirport: Id | null;
  /** Requested clock speed (0 = paused); the UI clock reads this. */
  speed: 0 | 1 | 2 | 3 | 4 | 5;
  /** Rolling history of daily snapshots (oldest first). */
  snapshots: FinanceSnapshot[];
  routeReports: Record<Id, RouteReport>;
  /** Events emitted by the most recent step. */
  events: SimEvent[];
  /** Events (ticks, finance, notices) not yet taken with `drainEvents`. */
  pendingEvents: SimEvent[];
  fleetMeta: Record<Id, AircraftMeta>;
  orders: AircraftOrder[];
  /** Open manufacturer and market offers (offers lane). */
  offers: Offer[];
  /** Last day each `kind:typeId` was offered, for cooldowns. */
  offerLog: Record<string, Day>;
  /** Modelled AI airlines; null = none (synthetic rivals only). See RIVALS.md. */
  rivals: RivalsState | null;
  /** Airlines that failed, with the fleet they released (for the offers lane). Oldest first. */
  bankruptcies: BankruptcyRecord[];
  /** Fleet-planner steering of the scheduler (pins, preferred types, spares). Absent = defaults. */
  planner?: PlannerState;
  /** Monotonic counters for ids: route, aircraft, order. */
  counters: { route: number; aircraft: number; order: number };
}
