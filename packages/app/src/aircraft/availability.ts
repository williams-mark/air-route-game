import type { AircraftType, Airport } from "@arg/contracts";
import { canFlyRoute, distanceKm, USABLE_RANGE_FRACTION } from "@arg/data";
import { COMMAND_PARAMS, LEDGER_PARAMS, defaultLayout, layoutSeats, maxRouteKm } from "@arg/sim";

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

/**
 * Longest sector a type can be given in the game, in km: nominal range less the fuel reserve, with the routing extension, and the
 * planning rule that only 85% of nominal range is usable. This is what route creation enforces, so it is lower than the nominal figure.
 */
export const usableRangeKm = (t: Pick<AircraftType, "rangeKm">): number =>
  Math.floor(Math.min(maxRouteKm(t as AircraftType), t.rangeKm * USABLE_RANGE_FRACTION));

/** One line explaining nominal versus usable range, for tooltips and notes. */
export function rangeNote(t: Pick<AircraftType, "rangeKm">): string {
  return `Nominal range ${t.rangeKm.toLocaleString()} km is the published figure. Usable is about ${usableRangeKm(t).toLocaleString()} km: ` +
    `the game plans on ${Math.round(USABLE_RANGE_FRACTION * 100)}% of nominal for payload and weather, and the sim holds back ${LEDGER_PARAMS.reserveKm} km of fuel ` +
    `for alternates and holding and flies ${Math.round((LEDGER_PARAMS.routeExtension - 1) * 100)}% beyond the great-circle distance.`;
}

/** Why a type cannot fly a-b in `year`, or null. Uses canFlyRoute; the reason text is derived from range/runway. */
export function routeBlock(t: AircraftType, a: Airport, b: Airport, year: number): string | null {
  if (!canFlyRoute(t, a, b)) {
    const km = distanceKm(a, b);
    if (km > usableRangeKm(t)) return `Range too short: route is ${Math.round(km).toLocaleString()} km, usable range ${usableRangeKm(t).toLocaleString()} km (nominal ${t.rangeKm.toLocaleString()} km)`;
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
