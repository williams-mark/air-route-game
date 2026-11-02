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
