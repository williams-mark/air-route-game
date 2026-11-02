import type { Airport, AircraftType, Id } from "@arg/contracts";
import { airports } from "./airports.js";
import { maxOverwaterKm } from "./overwater.js";

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

/** Island of each Hawaii airport (public geography). Used to decide whether a HI-HI route crosses water. */
const HI_ISLAND: Readonly<Record<string, string>> = {
  HNL: "Oahu", JRF: "Oahu", OGG: "Maui", JHM: "Maui", HNM: "Maui", KOA: "Hawaii", ITO: "Hawaii", MUE: "Hawaii",
  LIH: "Kauai", MKK: "Molokai", LUP: "Molokai", LNY: "Lanai",
};

/**
 * Fraction of the type's MTOW takeoff field length (runwayNeededM) assumed required on a real sector, since airliners rarely
 * depart at MTOW (e.g. 737-800 flies SFO-OGG into a ~2,070 m runway). Planning assumption, not a sourced figure.
 */
export const RUNWAY_SECTOR_FRACTION = 0.85;

/** True if the route crosses open water: CA<->HI, or HI<->HI on different islands. */
export function isOverwaterRoute(a: Airport, b: Airport): boolean {
  if (a.region !== b.region) return true;
  if (a.region === "HI") return (HI_ISLAND[a.id] ?? a.id) !== (HI_ISLAND[b.id] ?? b.id);
  return false;
}

/**
 * Whether the type can operate a->b: distance within usable range, runway at BOTH ends at least runwayNeededM x RUNWAY_SECTOR_FRACTION, and for overwater routes the distance within maxOverwaterKm[type].
 * Ignores payload, weather, slots and introYear/endYear (the sim handles availability).
 */
export function canFlyRoute(type: AircraftType, a: Airport, b: Airport): boolean {
  const km = distanceKm(a, b);
  if (!canFlyDistance(type, km)) return false;
  const need = type.runwayNeededM * RUNWAY_SECTOR_FRACTION;
  if (a.runwayM < need || b.runwayM < need) return false;
  if (isOverwaterRoute(a, b)) {
    const limit = maxOverwaterKm[type.id];
    if (limit === undefined || km > limit) return false;
  }
  return true;
}
