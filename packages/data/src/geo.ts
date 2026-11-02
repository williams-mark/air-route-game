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

/**
 * Runway length the type needs for a sector of `km`. Narrowbodies and turboprops use a flat RUNWAY_SECTOR_FRACTION. For widebodies
 * takeoff weight grows with fuel carried, so short sectors need less runway than the MTOW field length: 60% of runwayNeededM at zero distance, rising linearly to RUNWAY_SECTOR_FRACTION
 * (cap) at 75% of range. Planning assumption, not a sourced figure; lets A330/787 class aircraft use OGG from California.
 */
export function runwayRequiredM(type: AircraftType, km: number): number {
  if (!type.widebody) return type.runwayNeededM * RUNWAY_SECTOR_FRACTION;
  const ramp = 0.6 + 0.4 * Math.min(1, km / (0.75 * type.rangeKm));
  return type.runwayNeededM * Math.min(RUNWAY_SECTOR_FRACTION, ramp);
}

/** Regions on the North American mainland, joined by roads: CA, OR and WA. Hawaii is separated from all of them by open water. */
const MAINLAND_REGIONS: ReadonlySet<Airport["region"]> = new Set(["CA", "OR", "WA"]);

/** True when both airports are on the contiguous mainland (a road trip is possible and no water is crossed). */
export function isLandPair(a: Airport, b: Airport): boolean {
  return MAINLAND_REGIONS.has(a.region) && MAINLAND_REGIONS.has(b.region);
}

/** True if the route crosses open water: mainland (CA, OR, WA) <-> HI, or HI<->HI on different islands. */
export function isOverwaterRoute(a: Airport, b: Airport): boolean {
  if (isLandPair(a, b)) return false;
  if (a.region === "HI" && b.region === "HI") return (HI_ISLAND[a.id] ?? a.id) !== (HI_ISLAND[b.id] ?? b.id);
  return true;
}

/**
 * Whether the type can operate a->b: distance within usable range, runway at BOTH ends at least runwayNeededM x RUNWAY_SECTOR_FRACTION, and for overwater routes the distance within maxOverwaterKm[type].
 * Ignores payload, weather, slots and introYear/endYear (the sim handles availability).
 */
export function canFlyRoute(type: AircraftType, a: Airport, b: Airport): boolean {
  const km = distanceKm(a, b);
  if (!canFlyDistance(type, km)) return false;
  const need = runwayRequiredM(type, km);
  if (a.runwayM < need || b.runwayM < need) return false;
  if (isOverwaterRoute(a, b)) {
    const limit = maxOverwaterKm[type.id];
    if (limit === undefined || km > limit) return false;
  }
  return true;
}
