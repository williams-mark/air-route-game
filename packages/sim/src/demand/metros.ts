import type { Airport } from "@arg/contracts";
import { airports as dataAirports, metros as dataMetros, type MetroGroup } from "@arg/data";
import { airportOpen } from "../world/closures";

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

/**
 * Population overrides (people) for metros whose members have different, non-overlapping statistical areas (the sum of the `anchors`).
 * Every other metro uses the largest `metroPopulation` among its members, because their MSAs overlap (JFK, LGA and EWR all carry
 * the New York area). These three are the original calibration and are kept exactly.
 */
const METRO_POPULATION_OVERRIDE: Readonly<Record<string, { population: number; anchors: readonly string[] }>> = {
  LA: { population: 17_750_000, anchors: ["LAX", "ONT"] },
  SF: { population: 6_630_000, anchors: ["SFO", "SJC"] },
  // Seattle: BFI and PAE sit inside the Seattle-Tacoma-Bellevue MSA (SEA's population), so the anchor is SEA alone. Shares are tuning
  // weights, not sourced traffic: SEA carried nearly everything in 2015-2025 (PAE's terminal opened March 2019 with roughly 0.5M
  // passengers a year against SEA's 50M+; BFI has almost no scheduled service), so PAE and BFI get a small latent share the player can
  // build up. Portland is a single-airport metro (PDX; HIO has no airline service) and needs no entry: share 1.
  SEA: { population: 3_733_000, anchors: ["SEA"] },
};

/** Build sim metros from the data package's groups (`metros` in @arg/data): shares are used as given. Members missing from `airports` are dropped. */
export function metrosFromData(groups: readonly MetroGroup[], airports: readonly Airport[]): Metro[] {
  const pop = new Map(airports.map((a) => [a.id, a.metroPopulation] as const));
  const out: Metro[] = [];
  for (const g of groups) {
    const members = g.members.filter((m) => pop.has(m.airport));
    if (members.length === 0) continue;
    const shares: Record<string, number> = {};
    for (const m of members) shares[m.airport] = m.share;
    const ov = METRO_POPULATION_OVERRIDE[g.id];
    const biggest = members.reduce((best, m) => (pop.get(m.airport)! > pop.get(best.airport)! ? m : best));
    out.push({
      id: g.id,
      population: ov?.population ?? pop.get(biggest.airport)!,
      anchors: ov?.anchors ?? [biggest.airport],
      shares,
    });
  }
  return out;
}

export const DEFAULT_METROS: readonly Metro[] = metrosFromData(dataMetros, dataAirports);

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

const metroIndex = new WeakMap<readonly Metro[], Map<string, Metro>>();
function metroOf(metros: readonly Metro[], airportId: string): Metro | undefined {
  let idx = metroIndex.get(metros);
  if (!idx) {
    idx = new Map();
    for (const m of metros) for (const k of Object.keys(m.shares)) if (!idx.has(k)) idx.set(k, m);
    metroIndex.set(metros, idx);
  }
  return idx.get(airportId);
}

/**
 * Catchment of an airport. With `day`, members closed on that day (world/closures.ts) get share 0 and the rest share the metro
 * between them, so e.g. Berlin's demand moves to the surviving airport instead of vanishing while one of two airports is open.
 */
export function catchmentOf(
  airportId: string,
  ownPopulation: number,
  metros: readonly Metro[] | null | undefined,
  distKm = 0,
  concentration = METRO_CONCENTRATION,
  day?: number,
): MetroCatchment {
  if (metros) {
    const m = metroOf(metros, airportId);
    if (m) {
      const own = m.shares[airportId]!;
      if (day !== undefined && !airportOpen(airportId, day)) return { population: m.population, share: 0, metro: m.id };
      const phi = 1 + concentration * Math.min(1, (distKm / 2500) ** 2);
      let total = 0;
      for (const k in m.shares) if (day === undefined || airportOpen(k, day)) total += m.shares[k]! ** phi;
      return { population: m.population, share: own ** phi / total, metro: m.id };
    }
  }
  return { population: ownPopulation, share: 1, metro: null };
}
