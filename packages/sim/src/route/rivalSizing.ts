import type { Airport } from "@arg/contracts";
import { runChoice, type ChoiceParams, type Itinerary } from "../demand/choice";
import { SEGMENTS, type DayMarket, type SegmentMap } from "../demand/market";

/**
 * Size the synthetic rivals on demand that actually flies, not on the potential market.
 *
 * `market.baseWeekly` is potential demand before the outside option. On ground-competitive pairs (LAX-SAN) most of it
 * drives, so rivals sized on the potential would fly mostly empty and dilute the player to a ~17% load factor. Here a
 * probe run (rivals only, no player) measures the share of demand an all-rival market carries; callers hand the
 * returned market (baseWeekly x that share) to `buildRivals`. Long-haul pairs carry about 75-80%, so the
 * `rivalMarketCoverage` constant (0.8) is expressed against carried demand.
 */
export function rivalSizingMarket(
  a: Airport,
  b: Airport,
  dist: number,
  market: DayMarket,
  demand: SegmentMap<number>,
  params: ChoiceParams,
  buildRivals: (market: DayMarket) => Itinerary[],
): DayMarket {
  const total = SEGMENTS.reduce((s, g) => s + demand[g], 0);
  if (total <= 0) return market;
  const probe = runChoice({
    demand,
    itineraries: buildRivals(market),
    outside: { distanceKm: dist, driveAvailable: a.region === "CA" && b.region === "CA" },
    params,
  });
  const airShare = Math.max(0.05, Math.min(1, probe.totals.captured / total));
  return { ...market, baseWeekly: market.baseWeekly * airShare };
}

/**
 * Share of a pair's potential demand that an ordinary well-served carrier market carries (one benchmark-fare, high-frequency
 * itinerary against the outside option, which includes driving). About 0.75-0.8 on water crossings and long hauls, far less on
 * drivable pairs (LAX-SAN about 0.25). Used to size rival capacity on demand that actually flies.
 */
export function carriedShare(a: Airport, b: Airport, dist: number, demand: SegmentMap<number>, fare: number, params: ChoiceParams): number {
  const total = SEGMENTS.reduce((s, g) => s + demand[g], 0);
  if (total <= 0) return 1;
  const id = `probe:${a.id}-${b.id}`;
  const probe: Itinerary = {
    id, carrier: "probe", fare, quality: 0.5, marketDistanceKm: dist,
    legs: [{ id, origin: a.id, destination: b.id, distanceKm: dist, blockMin: ((dist * 1.04) / (840 * 0.93) + 0.65) * 60, weeklyFrequency: 100, weeklySeats: 100 * 400 }],
  };
  const r = runChoice({ demand, itineraries: [probe], outside: { distanceKm: dist, driveAvailable: a.region === "CA" && b.region === "CA" }, params });
  return Math.max(0.05, Math.min(1, r.totals.captured / total));
}
