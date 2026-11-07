import type { AircraftType } from "@arg/contracts";

/**
 * Which aircraft types exist in a given campaign year. Pure: the year is always passed in (never read from a clock).
 * Data: `introYear` (first entry into service) and `endYear` (last year of production, null = still in production) on each type.
 */

/** A type may be ordered new for this many years after its last production year ("recently out of production"; last deliveries). */
export const RECENT_OUT_OF_PRODUCTION_YEARS = 1;

/** Used aircraft of a type are offered only while the type was built within this many years (older types are retired from the market). */
export const USED_SALE_MAX_YEARS_AFTER_END = 25;

/** True when the manufacturer takes a new order for `t` in `year` (in production, or within the recent-out window, and introduced by the order lead). */
export function canOrderNew(t: Pick<AircraftType, "introYear" | "endYear">, year: number, leadYears: number): boolean {
  if (t.introYear > year + leadYears) return false;
  if (t.endYear !== null && t.endYear + RECENT_OUT_OF_PRODUCTION_YEARS < year) return false;
  return true;
}

/** The types the sim will take a new order for in `year`, smallest first by seats (the order list). */
export function orderableTypes<T extends Pick<AircraftType, "introYear" | "endYear" | "maxSeats">>(types: readonly T[], year: number, leadYears: number): T[] {
  return types.filter((t) => canOrderNew(t, year, leadYears)).sort((a, b) => a.maxSeats - b.maxSeats);
}

/** True when a used aircraft of `t` can be offered in `year`. */
export function usedSaleAllowed(t: Pick<AircraftType, "introYear" | "endYear">, year: number): boolean {
  return t.endYear === null || t.endYear + USED_SALE_MAX_YEARS_AFTER_END >= year;
}

/** True when a type is in production (new or recent) in `year`: introduced, and not past the recent-out window. */
export function inProduction(t: Pick<AircraftType, "introYear" | "endYear">, year: number): boolean {
  return t.introYear <= year && (t.endYear === null || t.endYear + RECENT_OUT_OF_PRODUCTION_YEARS >= year);
}
