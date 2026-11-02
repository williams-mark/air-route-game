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

/** Aircraft type id -> longest permitted overwater route in km. */
export const maxOverwaterKm: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    aircraftTypes.map((t) => {
      const m = diversionMinutes[t.id];
      if (m === undefined) throw new Error(`no diversion-time entry for ${t.id}`);
      return [t.id, m === null ? Number.POSITIVE_INFINITY : 2 * (m / 60) * ONE_ENGINE_SPEED_FRACTION * t.cruiseKmh];
    }),
  ),
);
