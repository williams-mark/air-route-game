import type { Aircraft, AircraftType, Day } from "@arg/contracts";
import { dayToDate, isLeapYear, START_YEAR } from "../time/calendar";

// ---------------------------------------------------------------------------
// Aircraft economics: financing, lifespan, obsolescence, passenger-service age penalty.
// Design parameters, not sourced figures (see packages/data/SOURCES.md, "Lifecycle and financing").
// ---------------------------------------------------------------------------
export const FINANCING_PARAMS = {
  /** Purchase: share of the net unit price paid at order; the rest is due at delivery. */
  purchaseDownFraction: 0.2,
  /** Lease: down payment at order, as a share of the aircraft's list price. */
  leaseDownFractionOfList: 0.1,
  /** Lease: uplift on the per-aircraft fixed operating cost (overheadPerAircraftPerDay) of leased aircraft. */
  leaseOperatingUplift: 0.15,
} as const;

/**
 * Credit line and financial distress (finance/credit.ts). Design parameters, not sourced figures: the shape follows how airline
 * revolving credit works (secured on owned aircraft, sized to cash flow, priced above the base rate) without modelling a lender.
 */
export const CREDIT_PARAMS = {
  /** Overdraft limit before collateral and revenue: a small unsecured line every airline gets, USD. */
  baseLimitUsd: 25_000_000,
  /** Share of the depreciated value of delivered, purchased aircraft that the lender advances against (leased aircraft are not ours to pledge). */
  fleetAdvanceRate: 0.5,
  /** Depreciation of an owned aircraft: straight line from list price to this residual share over the hard lifespan (LIFECYCLE_PARAMS.maxAgeYears). */
  residualValueFraction: 0.2,
  /** Cash-flow part of the limit: this many months of revenue, measured over the last `revenueWindowDays`. */
  revenueMonths: 1.5,
  revenueWindowDays: 90,
  /** Annual interest on the overdrawn amount, charged daily as a company cost (overdraft pricing in 2015-2025, base rate plus about 5 points). */
  annualInterestRate: 0.08,
  /** Distress begins when cash is below minus the limit and ends the day cash is back within the limit. Days of continuous distress after which the airline fails. A reminder goes out every `reminderDays`. */
  graceDays: 90,
  reminderDays: 30,
} as const;

export const LIFECYCLE_PARAMS = {
  daysPerYear: 365.25,
  /** Hard lifespan: aircraft retire on reaching this age. */
  maxAgeYears: 30,
  /** Years after a type's production end (its endYear) before obsolescence applies. */
  obsolescenceAfterEndYears: 15,
  /** Obsolete types: uplift on the price of new aircraft of that type and on its maintenance cost. */
  obsolescenceCostUplift: 0.4,
  /** Aircraft older than this get the service penalty. */
  servicePenaltyAfterYears: 15,
  /** Service penalty value once an aircraft is past servicePenaltyAfterYears (0..1). Read by the passenger-experience system. */
  servicePenalty: 0.1,
} as const;

/** Calendar year of a sim day. */
export function yearOf(day: Day): number {
  return dayToDate(day).year;
}

const yearStartDays = new Map<number, number>();
/** First sim day of a calendar year (memoised: pure, and cheap in the daily loop). */
function yearStartDay(year: number): number {
  let d = yearStartDays.get(year);
  if (d === undefined) {
    d = 0;
    for (let y = START_YEAR; y < year; y++) d += isLeapYear(y) ? 366 : 365;
    yearStartDays.set(year, d);
  }
  return d;
}

/** Has the type's production ended long enough ago to be obsolete on `day`? Types still in production (endYear null) never are. */
export function isObsolete(type: AircraftType, day: Day): boolean {
  if (type.endYear === null) return false;
  return day >= yearStartDay(type.endYear + LIFECYCLE_PARAMS.obsolescenceAfterEndYears);
}

/** Multiplier on the new-aircraft price and maintenance cost of this type on `day` (1 = no change). */
export function obsolescenceMultiplier(type: AircraftType, day: Day): number {
  return isObsolete(type, day) ? 1 + LIFECYCLE_PARAMS.obsolescenceCostUplift : 1;
}

/** Has the aircraft reached the hard lifespan (ageDays is its simulated age)? */
export function isRetired(aircraft: Pick<Aircraft, "ageDays">): boolean {
  return aircraft.ageDays >= LIFECYCLE_PARAMS.maxAgeYears * LIFECYCLE_PARAMS.daysPerYear;
}

/**
 * Passenger-experience service penalty (0 = none) for an aircraft on sim day `day`.
 * `aircraft.ageDays` is its age as of `asOfDay` (the sim day the state represents); the age on `day` is ageDays + (day - asOfDay).
 * Pure; fares are not changed here.
 */
export function lifecycleServicePenalty(aircraft: Pick<Aircraft, "ageDays">, day: Day, asOfDay: Day): number {
  const ageDaysOnDay = aircraft.ageDays + (day - asOfDay);
  return ageDaysOnDay > LIFECYCLE_PARAMS.servicePenaltyAfterYears * LIFECYCLE_PARAMS.daysPerYear ? LIFECYCLE_PARAMS.servicePenalty : 0;
}
