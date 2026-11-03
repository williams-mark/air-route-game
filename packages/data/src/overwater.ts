import { aircraftTypes } from "./aircraft.js";

/**
 * Overwater-capability model. See SOURCES.md ("Overwater / ETOPS model") for sources and assumptions.
 *
 * maxOverwaterKm[type] = longest single route (great-circle km) with no suitable alternate en route that the type may be
 * scheduled on. Derived as: 2 x (diversion minutes / 60 x ONE_ENGINE_SPEED_FRACTION x cruiseKmh), i.e. the route midpoint may be
 * no further than the ETOPS diversion radius from the route's two end airports.
 *  - Four-engine types: unlimited.
 *  - Twin jets with ETOPS approval: ETOPS minutes below.
 *  - Twin types without ETOPS (E175, CRJ, ATR): US "60-minute rule" (FAR 121.161), 60 min.
 *
 * maxOverwaterKm is the conservative bound for a route with NO alternate between its ends (CA-HI, England-Spain over the Bay of
 * Biscay far from land). Routes that pass near other suitable airports (North Atlantic via Newfoundland, Greenland, Iceland, Ireland;
 * the Channel; the Mediterranean) are judged by canFlyOverwater in geo.ts, which checks that every point of the great circle
 * is within etopsRadiusKm[type] of some alternate. That check only ever ADDS permitted routes to the maxOverwaterKm rule.
 */
export const ONE_ENGINE_SPEED_FRACTION = 0.9; // ESTIMATE: one-engine-inoperative cruise speed as a fraction of normal cruise.

/** Diversion time in minutes; null = four engines (no limit). */
const diversionMinutes: Record<string, number | null> = {
  "B737-700": 180, "B737-800": 180, "B737-900ER": 180, "B737-8": 180, "B737-9": 180,
  A319: 180, A320: 180, A321: 180, A320N: 180, A321N: 180,
  "A220-100": 180, "A220-300": 180,
  "B757-200": 180, "B767-300ER": 180,
  "B777-200ER": 330, "B777-300ER": 330,
  "B787-8": 330, "B787-9": 330, "B787-10": 330,
  "A330-200": 240, "A330-300": 240, "A330-900": 240,
  "A350-900": 370, "A350-1000": 370,
  "B747-400": null,
  E175: 60, CRJ700: 60, CRJ900: 60, "ATR72-600": 60,
};

/**
 * ETOPS-style diversion radius in km: the farthest a type may be from a suitable alternate airport, as
 * (diversion minutes / 60) x ONE_ENGINE_SPEED_FRACTION x cruiseKmh; Infinity for four-engine types. maxOverwaterKm = 2 x this.
 */
export const etopsRadiusKm: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    aircraftTypes.map((t) => {
      const m = diversionMinutes[t.id];
      if (m === undefined) throw new Error(`no diversion-time entry for ${t.id}`);
      return [t.id, m === null ? Number.POSITIVE_INFINITY : (m / 60) * ONE_ENGINE_SPEED_FRACTION * t.cruiseKmh];
    }),
  ),
);

/**
 * Airports outside the playable set that serve as en-route alternates on North Atlantic routes. Coordinates are OurAirports
 * reference points (public domain, snapshot 2026-11); that these airports are usable alternates is public aviation knowledge
 * (the standard North Atlantic ETOPS diversion set), and we assume each is always available (no weather or runway limits).
 */
export const OCEANIC_ALTERNATES: readonly { icao: string; name: string; lat: number; lon: number }[] = [
  { icao: "BIKF", name: "Keflavik", lat: 63.985, lon: -22.6056 },
  { icao: "BGSF", name: "Kangerlussuaq", lat: 67.0104, lon: -50.7153 },
  { icao: "BGBW", name: "Narsarsuaq", lat: 61.1596, lon: -45.4247 },
  { icao: "CYQX", name: "Gander", lat: 48.9363, lon: -54.5677 },
  { icao: "CYYR", name: "Goose Bay", lat: 53.3192, lon: -60.4258 },
  { icao: "CYYT", name: "St. John's", lat: 47.6186, lon: -52.7519 },
  { icao: "CYHZ", name: "Halifax", lat: 44.8808, lon: -63.5086 },
  { icao: "CYFB", name: "Iqaluit", lat: 63.7564, lon: -68.5558 },
  { icao: "EINN", name: "Shannon", lat: 52.702, lon: -8.9248 },
  { icao: "EGPK", name: "Glasgow Prestwick", lat: 55.5015, lon: -4.5772 },
  { icao: "EKVG", name: "Vagar (Faroe)", lat: 62.0633, lon: -7.2758 },
  { icao: "LPLA", name: "Lajes (Azores)", lat: 38.7618, lon: -27.0908 },
  { icao: "LPAZ", name: "Santa Maria (Azores)", lat: 36.9714, lon: -25.1706 },
];

/** Minimum runway (m) for a playable airport to count as an en-route alternate. */
export const ALTERNATE_MIN_RUNWAY_M = 2000;

/** Aircraft type id -> longest permitted overwater route in km (no suitable alternate anywhere along it). */
export const maxOverwaterKm: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    aircraftTypes.map((t) => {
      const m = diversionMinutes[t.id];
      if (m === undefined) throw new Error(`no diversion-time entry for ${t.id}`);
      return [t.id, m === null ? Number.POSITIVE_INFINITY : 2 * (m / 60) * ONE_ENGINE_SPEED_FRACTION * t.cruiseKmh];
    }),
  ),
);
