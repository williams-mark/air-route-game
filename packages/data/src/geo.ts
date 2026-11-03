import type { Airport, AircraftType, Id } from "@arg/contracts";
import { airports } from "./airports.js";
import { ALTERNATE_MIN_RUNWAY_M, OCEANIC_ALTERNATES, etopsRadiusKm, maxOverwaterKm } from "./overwater.js";

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

/**
 * True when a road (or rail) trip is possible between the two airports: same `landmass` (see SOURCES.md for the convention).
 * Hawaii is the one exception, kept as before: no HI-HI pair counts, since inter-island travel by road is impractical and the sim
 * treats HI-HI separately (island boost), see isOverwaterRoute for the same-island case.
 */
export function isLandPair(a: Airport, b: Airport): boolean {
  return a.landmass === b.landmass && a.landmass !== "US-HI";
}

/**
 * True if the route crosses open water: different landmasses, or HI<->HI on different islands. CONUS<->AK and CONUS<->HI count as
 * overwater (CONUS<->AK actually crosses Canada, but the coast route is largely over the Gulf of Alaska and ETOPS-style rules apply).
 */
export function isOverwaterRoute(a: Airport, b: Airport): boolean {
  if (a.landmass === "US-HI" && b.landmass === "US-HI") return (HI_ISLAND[a.id] ?? a.id) !== (HI_ISLAND[b.id] ?? b.id);
  return a.landmass !== b.landmass;
}

const ROUTE_SAMPLE_KM = 100;
const alternatePoints: readonly { lat: number; lon: number }[] = [
  ...OCEANIC_ALTERNATES,
  ...airports.filter((x) => x.runwayM >= ALTERNATE_MIN_RUNWAY_M),
].map((x) => ({ lat: x.lat, lon: x.lon }));
const coverageCache = new Map<string, boolean>();

/** Great-circle distance in km between raw coordinates. */
function gcKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const h = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True if every point of the a-b great circle (sampled every ~100 km) is within radiusKm of an alternate or an end airport. */
function routeCoveredByAlternates(a: Airport, b: Airport, km: number, radiusKm: number): boolean {
  const key = `${a.id}>${b.id}:${Math.round(radiusKm)}`;
  const hit = coverageCache.get(key) ?? coverageCache.get(`${b.id}>${a.id}:${Math.round(radiusKm)}`);
  if (hit !== undefined) return hit;
  const la1 = toRad(a.lat), lo1 = toRad(a.lon), la2 = toRad(b.lat), lo2 = toRad(b.lon);
  const delta = km / EARTH_RADIUS_KM;
  const sinD = Math.sin(delta);
  const n = Math.max(2, Math.ceil(km / ROUTE_SAMPLE_KM));
  let ok = true;
  for (let i = 1; i < n && ok; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * delta) / sinD, B = Math.sin(f * delta) / sinD;
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    const lon = (Math.atan2(y, x) * 180) / Math.PI;
    let near = gcKm(lat, lon, a.lat, a.lon) <= radiusKm || gcKm(lat, lon, b.lat, b.lon) <= radiusKm;
    for (let j = 0; !near && j < alternatePoints.length; j++) near = gcKm(lat, lon, alternatePoints[j]!.lat, alternatePoints[j]!.lon) <= radiusKm;
    ok = near;
  }
  coverageCache.set(key, ok);
  return ok;
}

/**
 * May the type fly the overwater route a-b (distance km)? Yes if km <= maxOverwaterKm[type] (no alternate needed), or if the whole
 * great circle stays within the type's ETOPS diversion radius of a suitable airport (North Atlantic via Newfoundland, Greenland,
 * Iceland and Ireland, the Mediterranean islands, the Gulf of Alaska coast).
 */
export function canFlyOverwater(type: AircraftType, a: Airport, b: Airport, km: number = distanceKm(a, b)): boolean {
  const limit = maxOverwaterKm[type.id];
  if (limit === undefined) return false;
  if (km <= limit) return true;
  const radius = etopsRadiusKm[type.id];
  return radius !== undefined && routeCoveredByAlternates(a, b, km, radius);
}

/**
 * Whether the type can operate a->b: distance within usable range, runway at BOTH ends at least runwayRequiredM, and for overwater routes
 * canFlyOverwater. Ignores payload, weather, slots and introYear/endYear (the sim handles availability).
 */
export function canFlyRoute(type: AircraftType, a: Airport, b: Airport): boolean {
  const km = distanceKm(a, b);
  if (!canFlyDistance(type, km)) return false;
  const need = runwayRequiredM(type, km);
  if (a.runwayM < need || b.runwayM < need) return false;
  if (isOverwaterRoute(a, b) && !canFlyOverwater(type, a, b, km)) return false;
  return true;
}
