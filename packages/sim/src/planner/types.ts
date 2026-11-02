import type { Day, Id } from "@arg/contracts";
import type { CheckKind } from "../state";

/** A player pin: the aircraft flies this route first. Optional inclusive day window (time-boxed cover). */
export interface PlannerPin {
  routeId: Id;
  fromDay?: Day;
  toDay?: Day;
}

/**
 * Player steering of the automatic scheduler. Optional in SimState: absent (or empty) reproduces the plain scheduler.
 * Plain JSON, so it serialises with the rest of the state and old saves simply lack it.
 */
export interface PlannerState {
  /** Aircraft id -> pins (a permanent pin plus any time-boxed covers; the earliest-starting active one wins). */
  pins: Record<Id, PlannerPin[]>;
  /** Route id -> ordered fallback aircraft types. */
  routeTypes: Record<Id, Id[]>;
  /** Aircraft held as spares. */
  reserved: Record<Id, true>;
  /** Coverage gap ids the player chose to ignore. */
  ignoredGaps: string[];
}

export type PlannerCommand =
  | { kind: "pinAircraft"; aircraftId: Id; routeId: Id | null; fromDay?: Day; toDay?: Day }
  | { kind: "setRouteTypes"; routeId: Id; preferredTypeIds: Id[] }
  | { kind: "reserveAircraft"; aircraftId: Id; reserve: boolean }
  | { kind: "applyCover"; aircraftId: Id; routeId: Id; fromDay: Day; toDay: Day; gapId?: string }
  | { kind: "ignoreGap"; gapId: string; ignore: boolean };

export const EMPTY_PLANNER: PlannerState = { pins: {}, routeTypes: {}, reserved: {}, ignoredGaps: [] };

// --- Forecast ---------------------------------------------------------------

export type ForecastKind = CheckKind | "refit" | "delivery";

/** One out-of-service window (inclusive start, exclusive end). A checks have zero length and are listed in `aChecks`. */
export interface DowntimeWindow {
  kind: "B" | "C" | "D" | "refit";
  startDay: Day;
  endDay: Day;
  /** The window is already running (started before today). */
  underway: boolean;
  /** Latest day the check may start if the scheduler defers it (due day + grace) when it is not underway. */
  latestStartDay: Day;
}

export interface AircraftForecast {
  aircraftId: Id;
  /** Day an on-order aircraft joins the fleet (null if already delivered). */
  deliveryDay: Day | null;
  /** Dates of the overnight A checks (no downtime). */
  aChecks: Day[];
  /** Heavy checks and refits, in date order. */
  windows: DowntimeWindow[];
}

export interface FleetForecast {
  fromDay: Day;
  toDay: Day;
  aircraft: Record<Id, AircraftForecast>;
}

// --- Coverage ---------------------------------------------------------------

export interface CoverageGap {
  /** `${routeId}:${fromDay}:${toDay}`. */
  id: string;
  routeId: Id;
  fromDay: Day;
  /** Inclusive. */
  toDay: Day;
  requestedPerWeek: number;
  scheduledPerWeek: number;
  /** Weekly round trips lost to forecast downtime (what the same fleet would fly with nothing in check). */
  lostToDowntime: number;
  /** True when the route is short even with every aircraft in service. */
  structural: boolean;
  /** Aircraft that normally fly the route and are out of service in the window. */
  causes: Array<{ aircraftId: Id; kind: DowntimeWindow["kind"] | "delivery"; startDay: Day; endDay: Day }>;
  /** 0..1, share of weekly round trips missing; longer gaps weigh more in sorting. */
  severity: number;
  summary: string;
}

export interface CoverSuggestion {
  aircraftId: Id;
  routeId: Id;
  gapId: string;
  fromDay: Day;
  toDay: Day;
  /** Higher is better. */
  score: number;
  sameType: boolean;
  sameSizeClass: boolean;
  /** Weekly round trips the aircraft can add on the route. */
  roundTripsPerWeek: number;
  /** Estimated weekly profit change (USD) from flying those trips with this aircraft's cabin. */
  profitDeltaPerWeek: number;
  seats: number;
  /** Seats of the aircraft normally flying the route (for mismatch notes), or 0. */
  baselineSeats: number;
  notes: string[];
}
