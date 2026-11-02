/**
 * Multi-airport metro catchments (MODEL.md section 1a).
 *
 * Airports in the same metro share the metro's demand by airport attractiveness instead of each counting the
 * whole metro. The pair formula is evaluated once on metro populations and then split:
 *   W(airport a, airport b) = W_metro(metro(a), metro(b), d_ab) * share(a) * share(b)
 * so the sum over all airport pairs between two metros equals the metro-to-metro volume.
 *
 * Shares are rounded approximations of 2015 passenger traffic within each metro (FAA/DOT enplanement statistics, from
 * memory, NOT sourced data in packages/data): LAX ~75M, SNA ~10M, ONT ~4M, BUR ~4M, LGB ~3M; SFO ~46M, OAK ~11M,
 * SJC ~9M. They are tuning weights, not facts; edit `DEFAULT_METROS` to refine.
 */
export interface Metro {
  id: string;
  /**
   * Metro (combined statistical area) population in people: the sum of the `metroPopulation` of the `anchors`, which are
   * airports in packages/data whose MSAs do not overlap (checked by a test).
   */
  population: number;
  anchors: readonly string[];
  /** Airport id -> share of the metro's demand (sums to 1). */
  shares: Readonly<Record<string, number>>;
}

export const DEFAULT_METROS: readonly Metro[] = [
  { id: "LA", anchors: ["LAX", "ONT"], population: 17_750_000, shares: { LAX: 0.78, SNA: 0.1, ONT: 0.044, BUR: 0.042, LGB: 0.034 } },
  { id: "SF", anchors: ["SFO", "SJC"], population: 6_630_000, shares: { SFO: 0.7, OAK: 0.16, SJC: 0.14 } },
];

export interface MetroCatchment {
  /** Metro population used in the gravity formula, people. */
  population: number;
  /** Fraction of the metro's demand attributed to this airport (1 for single-airport metros). */
  share: number;
  metro: string | null;
}

/**
 * Long routes concentrate on the dominant airport of a metro (LAX gets nearly all LA-Hawaii traffic, SNA and BUR little):
 * weights are `share ^ phi` renormalised within the metro, with `phi = 1 + concentration x min(1, d / 2500 km)`.
 * Short pairs keep (nearly) the base shares. The shares of a metro still sum to 1, so metro-to-metro totals are unchanged.
 */
export const METRO_CONCENTRATION = 1.2;

export function catchmentOf(
  airportId: string,
  ownPopulation: number,
  metros: readonly Metro[] | null | undefined,
  distKm = 0,
  concentration = METRO_CONCENTRATION,
): MetroCatchment {
  if (metros) {
    for (const m of metros) {
      const own = m.shares[airportId];
      if (own === undefined) continue;
      const phi = 1 + concentration * Math.min(1, (distKm / 2500) ** 2);
      let total = 0;
      for (const k of Object.keys(m.shares)) total += m.shares[k]! ** phi;
      return { population: m.population, share: own ** phi / total, metro: m.id };
    }
  }
  return { population: ownPopulation, share: 1, metro: null };
}
