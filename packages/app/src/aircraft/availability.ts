import type { AircraftType, Airport } from "@arg/contracts";
import { canFlyRoute, distanceKm, USABLE_RANGE_FRACTION } from "@arg/data";
import { COMMAND_PARAMS, defaultLayout, layoutSeats } from "@arg/sim";

export type Availability = "future" | "current" | "ended";

/** Production state of a type in a sim year. */
export function availabilityOf(t: Pick<AircraftType, "introYear" | "endYear">, year: number): Availability {
  if (year < t.introYear) return "future";
  if (t.endYear !== null && year > t.endYear) return "ended";
  return "current";
}
export const AVAIL_LABEL: Record<Availability, string> = { future: "Not yet in production", current: "In production", ended: "Out of production" };

/** Typical seats = the sim's default cabin for the type. */
export const typicalSeats = (t: AircraftType): number => layoutSeats(defaultLayout(t));

/** Why a type cannot be ordered in `year`, or null if it can (mirrors the sim's orderAircraft rules). */
export function orderBlock(t: AircraftType, year: number): string | null {
  if (t.endYear !== null && t.endYear < year) return `Out of production since ${t.endYear}; buy used via Offers`;
  if (t.introYear > year + COMMAND_PARAMS.orderLeadYears) return `Orders open in ${t.introYear - COMMAND_PARAMS.orderLeadYears} (enters service ${t.introYear})`;
  return null;
}

/** Why a type cannot fly a-b in `year`, or null. Uses canFlyRoute; the reason text is derived from range/runway. */
export function routeBlock(t: AircraftType, a: Airport, b: Airport, year: number): string | null {
  if (!canFlyRoute(t, a, b)) {
    const km = distanceKm(a, b);
    if (km > t.rangeKm * USABLE_RANGE_FRACTION) return `Range too short (${Math.round(km).toLocaleString()} km route)`;
    return "Runway or overwater limits";
  }
  const av = availabilityOf(t, year);
  if (av === "future") return `Not built until ${t.introYear}`;
  return null;
}

/** Filter helper for the picker: drops types whose block reason is non-null when `hideBlocked`. */
export function filterTypes(types: readonly AircraftType[], block: ((t: AircraftType) => string | null) | undefined, hideBlocked: boolean): AircraftType[] {
  return !block || !hideBlocked ? [...types] : types.filter((t) => block(t) === null);
}
