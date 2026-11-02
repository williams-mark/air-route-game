// Test-only fixtures. Approximate public figures (metro populations, runway lengths, manufacturer
// spec sheets); NOT the sourced dataset, which lives in packages/data. Do not use for gameplay.
import type { Aircraft, AircraftType, Airport } from "@arg/contracts";

const ap = (
  id: string, name: string, city: string, lat: number, lon: number, region: Airport["region"],
  runwayM: number, metroPopulation: number, gdpPerCapita: number, tourismIndex: number, slotsPerHour: number,
): Airport => ({ id, name, city, lat, lon, region, runwayM, metroPopulation, gdpPerCapita, tourismIndex, slotsPerHour });

export const LAX = ap("LAX", "Los Angeles Intl", "Los Angeles", 33.9425, -118.4081, "CA", 3685, 13_200_000, 78_000, 0.45, 100);
export const SFO = ap("SFO", "San Francisco Intl", "San Francisco", 37.6213, -122.379, "CA", 3618, 6_500_000, 98_000, 0.5, 80);
export const SAN = ap("SAN", "San Diego Intl", "San Diego", 32.7336, -117.1897, "CA", 2865, 3_300_000, 72_000, 0.6, 50);
export const HNL = ap("HNL", "Daniel K. Inouye Intl", "Honolulu", 21.3187, -157.9225, "HI", 3752, 1_000_000, 70_000, 1.0, 60);
export const OGG = ap("OGG", "Kahului", "Kahului", 20.8986, -156.4305, "HI", 2182, 170_000, 55_000, 1.0, 20);

export const AIRPORTS: Airport[] = [LAX, SFO, SAN, HNL, OGG];

const ac = (
  id: string, manufacturer: string, name: string, rangeKm: number, cruiseKmh: number, maxSeats: number,
  fuelBurnKgPerKm: number, runwayNeededM: number, listPriceUsdM: number, introYear: number, widebody: boolean,
): AircraftType => ({
  id, manufacturer, name, rangeKm, cruiseKmh, maxSeats, fuelBurnKgPerKm, runwayNeededM, listPriceUsdM,
  introYear, endYear: null, widebody,
});

export const B738 = ac("B737-800", "Boeing", "737-800", 5436, 842, 189, 3.0, 2300, 106, 1998, false);
export const A21N = ac("A321neo", "Airbus", "A321neo", 6850, 833, 244, 2.7, 2200, 129, 2016, false);
export const B789 = ac("B787-9", "Boeing", "787-9", 14140, 903, 420, 6.0, 2800, 292, 2014, true);
export const CRJ9 = ac("CRJ900", "Bombardier", "CRJ900", 2900, 830, 90, 2.1, 1800, 48, 2003, false);

export const AIRCRAFT_TYPES: AircraftType[] = [B738, A21N, B789, CRJ9];

export function makeAircraft(id: string, typeId: string, seatsY: number): Aircraft {
  return {
    id,
    typeId,
    tailNumber: `N${id}`,
    layout: { sections: [{ cls: "Y", rows: Math.ceil(seatsY / 6), seatsAcross: 6, pitchIn: 31 }] },
    status: "active",
    ageDays: 0,
    hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 },
  };
}
