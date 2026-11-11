import type { AircraftType } from "@arg/contracts";
import boeing from "./aircraft/boeing.js";
import airbus from "./aircraft/airbus.js";
import douglas from "./aircraft/douglas.js";
import other from "./aircraft/other.js";
import type { Row, Visual } from "./aircraft/schema.js";

export type { Visual, EngineLayout } from "./aircraft/schema.js";

// See SOURCES.md for per-field provenance. fuelBurnKgPerKm is an ESTIMATE (cruise average);
// runwayNeededM is APPROXIMATE (takeoff field length at typical MTOW, sea level, ISA);
// listPriceUsdM is manufacturer LIST price (real deals are heavily discounted; older types are estimates).
// endYear = end of production of that variant (null = still in production). Retired-from-service dates are not modelled.

const entries = [boeing, airbus, douglas, other];
const rows: Row[] = entries.flatMap((e) => e.rows);

/** Family tile ("737", "A300", "DC-9") of every type id; a test checks each type has one. */
export const aircraftFamilyById: Readonly<Record<string, string>> = Object.assign({}, ...entries.map((e) => e.family));
/** Drawing data for the side-view tiles. */
export const aircraftVisualById: Readonly<Record<string, Visual>> = Object.assign({}, ...entries.map((e) => e.visual));
export const aircraftTypes: AircraftType[] = rows.map(
  ([id, manufacturer, name, rangeKm, cruiseKmh, maxSeats, fuelBurnKgPerKm, runwayNeededM, listPriceUsdM, introYear, endYear, widebody]) => ({
    id, manufacturer, name, rangeKm, cruiseKmh, maxSeats, fuelBurnKgPerKm, runwayNeededM, listPriceUsdM, introYear, endYear, widebody,
  }),
);
