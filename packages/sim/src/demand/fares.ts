import type { Airport } from "@arg/contracts";
import { distanceKm } from "../geo";
import { fareLevel, surfaceAlternative } from "../world/regions";
import { benchmarkFare, type OutsideContext } from "./choice";

/** Benchmark fare for the pair: the US-calibrated curve times the market's fare level (1 within the US; world/regions.ts). */
export function benchmarkFareFor(a: Airport, b: Airport, dist: number = distanceKm(a, b)): number {
  return benchmarkFare(dist) * fareLevel(a, b);
}

/** The outside option of a pair for the choice model: drive and rail alternatives, fare level. */
export function outsideFor(a: Airport, b: Airport, dist: number = distanceKm(a, b)): OutsideContext {
  const sf = surfaceAlternative(a, b);
  return { distanceKm: dist, driveAvailable: sf.drive, fareLevel: fareLevel(a, b), rail: sf.rail };
}
