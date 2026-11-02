import type { Airport, AircraftType, Id } from "@arg/contracts";
import { airports } from "./airports.js";

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle (haversine) distance in km. */
export function distanceKm(a: Airport, b: Airport): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const airportById: ReadonlyMap<Id, Airport> = new Map(airports.map((a) => [a.id, a]));

/** Fraction of published range assumed usable on a real route (reserves, alternates, payload). Planning assumption, not a sourced figure. */
export const USABLE_RANGE_FRACTION = 0.85;

/** True if the type can fly the sector nonstop under the usable-range assumption. Ignores runway limits and ETOPS. */
export function canFlyDistance(type: AircraftType, km: number): boolean {
  return km <= type.rangeKm * USABLE_RANGE_FRACTION;
}
