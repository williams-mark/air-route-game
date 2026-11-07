import type { AircraftType } from "@arg/contracts";
import { inProduction } from "../fleet/availability";

/** Earliest selectable campaign start year (policy floor). Starts earlier than the data supports are rejected by `startYearError`. */
export const MIN_START_YEAR = 1965;

/** The first year in which at least one aircraft type in `types` is in production, or null for an empty list. */
export function earliestFleetYear(types: readonly Pick<AircraftType, "introYear" | "endYear">[]): number | null {
  if (types.length === 0) return null;
  return Math.min(...types.map((t) => t.introYear));
}

/**
 * Why `year` cannot start a game, or null if it can. A start year needs a whole year, no earlier than `MIN_START_YEAR`, no later
 * than `presentYear` (the caller's notion of today; the sim never reads a clock), and at least one aircraft type in production that
 * year (the starting fleet is built from them).
 */
export function startYearError(year: number, presentYear: number, types: readonly Pick<AircraftType, "introYear" | "endYear">[]): string | null {
  if (!Number.isInteger(year)) return "Start year must be a whole number.";
  if (year < MIN_START_YEAR) return `Start year must be ${MIN_START_YEAR} or later.`;
  if (year > presentYear) return `Start year cannot be after ${presentYear}.`;
  if (!types.some((t) => inProduction(t, year))) {
    const first = earliestFleetYear(types);
    return `No aircraft were in production in ${year} in the game data, so there is no fleet to start with.${first !== null ? ` The earliest start with a fleet is ${first}.` : ""}`;
  }
  return null;
}
