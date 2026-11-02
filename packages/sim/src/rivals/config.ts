import type { Archetype } from "./types";

/** Archetype traits. All money in USD; fares are multiples of `benchmarkFare(distance)`. See RIVALS.md. */
export interface ArchetypeSpec {
  label: string;
  /** Seats per flight as a fraction of the type's maxSeats. */
  seatDensity: number;
  /** Share of seats in the J cabin (0 = single class) and its fare multiple of Y. */
  premiumSeatShare: number;
  premiumFareMult: number;
  /** Default Y fare as a multiple of the benchmark fare, and the service quality (0.5 neutral). */
  fareFactor: number;
  quality: number;
  /** Fewest weekly round trips worth flying; a new route starts at no less (if the aircraft allows). */
  minFrequency: number;
  maxEntryFrequency: number;
  maxFrequency: number;
  /** Target share of the potential market (as seats at 80% load) a new route is sized for. */
  entryShare: number;
  /** Price-war behaviour. */
  maxFareCut: number;
  floorFareFactor: number;
  /** In a price war the rival aims at (lowest aggressor fare x matchFactor). */
  matchFactor: number;
  memoryDays: number;
  cooldownDays: number;
  freqResponse: boolean;
  /** Std of the profit-estimate error as a fraction of route revenue. */
  estimateNoise: number;
  minEntryProfitPerWeek: number;
  minEntryMargin: number;
  /** Costs the route ledger does not carry (HQ, sales, IT, labour above crew, insurance, finance), as a share of route revenue. */
  indirectCostPct: number;
  /** Fixed corporate cost per day (before aircraft overhead). */
  corporateOverheadPerDay: number;
  /** Weeks of fixed cost kept in cash before the airline will grow. */
  reserveWeeks: number;
  maxRoutes: number;
  /** Candidate market filter. */
  candidate: { minKm: number; maxKm: number; minDemand: number; minMetro: number; minSlots: number; interislandOnly: boolean };
  /** Aircraft preference (first feasible and available wins ties). */
  types: string[];
  maxAgeYears: number;
}

export const ARCHETYPES: Record<Archetype, ArchetypeSpec> = {
  legacy: {
    label: "Legacy network carrier",
    seatDensity: 0.86, premiumSeatShare: 0.08, premiumFareMult: 3.0, fareFactor: 1.04, quality: 0.62,
    minFrequency: 7, maxEntryFrequency: 28, maxFrequency: 120, entryShare: 0.2,
    maxFareCut: 0.22, floorFareFactor: 0.72, matchFactor: 1.08, memoryDays: 120, cooldownDays: 60, freqResponse: true,
    estimateNoise: 0.18, indirectCostPct: 0.19, minEntryProfitPerWeek: 12_000, minEntryMargin: 0.05,
    corporateOverheadPerDay: 14_000, reserveWeeks: 10, maxRoutes: 40,
    candidate: { minKm: 250, maxKm: 6000, minDemand: 1500, minMetro: 0, minSlots: 15, interislandOnly: false },
    types: ["B737-800", "A320", "B737-900ER", "A321", "B757-200", "B737-8", "A321N", "A320N", "B767-300ER", "A330-200", "B777-200ER", "B787-8", "B787-9", "A330-300", "B777-300ER", "A350-900"],
    maxAgeYears: 27,
  },
  lcc: {
    label: "Low-cost carrier",
    seatDensity: 0.97, premiumSeatShare: 0, premiumFareMult: 1, fareFactor: 0.86, quality: 0.42,
    minFrequency: 7, maxEntryFrequency: 21, maxFrequency: 100, entryShare: 0.17,
    maxFareCut: 0.3, floorFareFactor: 0.58, matchFactor: 0.99, memoryDays: 75, cooldownDays: 45, freqResponse: false,
    estimateNoise: 0.22, indirectCostPct: 0.135, minEntryProfitPerWeek: 8_000, minEntryMargin: 0.04,
    corporateOverheadPerDay: 5_000, reserveWeeks: 8, maxRoutes: 32,
    candidate: { minKm: 250, maxKm: 4300, minDemand: 1000, minMetro: 400_000, minSlots: 15, interislandOnly: false },
    types: ["B737-800", "A320", "B737-700", "A319", "A321", "B737-8", "A320N", "A321N", "B737-900ER"],
    maxAgeYears: 22,
  },
  regional: {
    label: "Regional/commuter",
    seatDensity: 0.92, premiumSeatShare: 0, premiumFareMult: 1, fareFactor: 1.12, quality: 0.46,
    minFrequency: 7, maxEntryFrequency: 24, maxFrequency: 70, entryShare: 0.45,
    maxFareCut: 0.15, floorFareFactor: 0.8, matchFactor: 1.05, memoryDays: 60, cooldownDays: 45, freqResponse: true,
    estimateNoise: 0.28, indirectCostPct: 0.19, minEntryProfitPerWeek: 4_000, minEntryMargin: 0.06,
    corporateOverheadPerDay: 3_000, reserveWeeks: 10, maxRoutes: 26,
    candidate: { minKm: 150, maxKm: 1000, minDemand: 150, minMetro: 0, minSlots: 8, interislandOnly: false },
    types: ["ATR72-600", "CRJ700", "CRJ900", "E175", "A220-100"],
    maxAgeYears: 24,
  },
  interisland: {
    label: "Interisland carrier",
    seatDensity: 0.9, premiumSeatShare: 0.06, premiumFareMult: 2.0, fareFactor: 1.0, quality: 0.5,
    minFrequency: 14, maxEntryFrequency: 56, maxFrequency: 150, entryShare: 0.4,
    maxFareCut: 0.2, floorFareFactor: 0.7, matchFactor: 1.02, memoryDays: 90, cooldownDays: 60, freqResponse: true,
    estimateNoise: 0.2, indirectCostPct: 0.17, minEntryProfitPerWeek: 5_000, minEntryMargin: 0.06,
    corporateOverheadPerDay: 4_000, reserveWeeks: 10, maxRoutes: 20,
    candidate: { minKm: 40, maxKm: 600, minDemand: 200, minMetro: 0, minSlots: 4, interislandOnly: true },
    types: ["B737-700", "A319", "ATR72-600", "CRJ700"],
    maxAgeYears: 26,
  },
};

export interface StartingRivalSpec {
  id: string;
  name: string;
  archetype: Archetype;
  bases: string[];
  cash: number;
  /** Routes: origin, destination, share of the potential market (seat share at 80% load). */
  routes: ReadonlyArray<readonly [string, string, number]>;
}

/**
 * The 2015 field. Fictional names. Shares are of `baseWeeklyDemand`; frequencies and fleets are derived from them at
 * set-up, so nothing here is a claimed real-world figure. A route that no allowed aircraft can fly (`canFlyRoute`) is skipped.
 */
export const STARTING_RIVALS: StartingRivalSpec[] = [
  {
    id: "pacific-crown", name: "Pacific Crown", archetype: "legacy", bases: ["SFO", "LAX"], cash: 450_000_000,
    routes: [
      ["SFO", "LAX", 0.17], ["SFO", "SAN", 0.18], ["SFO", "BUR", 0.12], ["SFO", "SNA", 0.14], ["SFO", "ONT", 0.1],
      ["LAX", "SJC", 0.1], ["LAX", "SMF", 0.1], ["LAX", "OAK", 0.06],
      ["SFO", "HNL", 0.24], ["SFO", "OGG", 0.24], ["SFO", "KOA", 0.16], ["SFO", "LIH", 0.16],
      ["LAX", "HNL", 0.22], ["LAX", "OGG", 0.22], ["LAX", "KOA", 0.14], ["LAX", "LIH", 0.14],
    ],
  },
  {
    id: "kestrel-air", name: "Kestrel Air", archetype: "lcc", bases: ["SAN", "OAK"], cash: 180_000_000,
    routes: [
      ["SAN", "OAK", 0.2], ["SAN", "SMF", 0.2], ["SAN", "SFO", 0.16], ["SAN", "SJC", 0.12],
      ["OAK", "LAX", 0.14], ["OAK", "BUR", 0.14], ["OAK", "SNA", 0.14], ["OAK", "LGB", 0.12],
      ["OAK", "HNL", 0.12], ["OAK", "OGG", 0.12], ["SAN", "HNL", 0.08],
    ],
  },
  {
    id: "golden-state-express", name: "Golden State Express", archetype: "regional", bases: ["LAX", "SFO"], cash: 90_000_000,
    routes: [
      ["LAX", "SBA", 0.3], ["LAX", "MRY", 0.3], ["LAX", "SBP", 0.35], ["LAX", "PSP", 0.25], ["LAX", "FAT", 0.3],
      ["LAX", "MMH", 0.5], ["SFO", "ACV", 0.5], ["SFO", "RDD", 0.4], ["SFO", "SBA", 0.25], ["SFO", "FAT", 0.2],
      ["SFO", "PSP", 0.2], ["LAX", "RDD", 0.2],
    ],
  },
  {
    id: "islander", name: "Islander", archetype: "interisland", bases: ["HNL", "OGG"], cash: 120_000_000,
    routes: [
      ["HNL", "OGG", 0.32], ["HNL", "KOA", 0.32], ["HNL", "LIH", 0.32], ["HNL", "ITO", 0.3], ["OGG", "KOA", 0.25],
      ["OGG", "LIH", 0.2], ["HNL", "MKK", 0.5], ["HNL", "LNY", 0.5], ["OGG", "ITO", 0.15],
    ],
  },
  {
    id: "sierra-jet", name: "Sierra Jet", archetype: "lcc", bases: ["SMF", "SJC"], cash: 130_000_000,
    routes: [
      ["SMF", "LAX", 0.14], ["SMF", "SAN", 0.18], ["SMF", "BUR", 0.14], ["SMF", "SNA", 0.12], ["SMF", "ONT", 0.1],
      ["SJC", "SAN", 0.14], ["SJC", "LAX", 0.14], ["SJC", "SNA", 0.1], ["SMF", "HNL", 0.1], ["SJC", "HNL", 0.1],
      ["SMF", "OGG", 0.1], ["SJC", "OGG", 0.1], ["SMF", "LGB", 0.1],
    ],
  },
];

export interface EntrantSpec {
  id: string;
  name: string;
  archetype: Archetype;
  bases: string[];
  cash: number;
  /** Launch date as years since 2015-01-01 (fractional); jittered by +/- `jitterDays` from the seed. */
  launchYear: number;
  jitterDays: number;
  initialRoutes: number;
}

/** Scheduled new entrants (rare). Random extra entrants: see RIVAL_PARAMS.randomEntrantChancePerYear. */
export const SCHEDULED_ENTRANTS: EntrantSpec[] = [
  { id: "ember-air", name: "Ember Air", archetype: "lcc", bases: ["ONT", "LGB"], cash: 70_000_000, launchYear: 2.3, jitterDays: 90, initialRoutes: 4 },
];

/** Names for random startups. Fictional. */
export const ENTRANT_NAME_POOL = ["Halcyon Jet", "Redwood Wings", "Tradewind Air", "Cormorant Air", "Mesa Flyer", "Lumen Air"];

export const RIVAL_PARAMS = {
  /** Cadence in weeks: monthly = 4 weeks, quarterly = 13, annual = 52. Each airline has its own phase. */
  monthWeeks: 4, quarterWeeks: 13, yearWeeks: 52,
  targetLoadFactor: 0.8,
  /** Fleet needed = sum of route aircraft-equivalents x this (spares, maintenance). */
  fleetSpareFactor: 1.06,
  /** Refundable deposit when leasing an aircraft, in months of lease. */
  depositMonths: 2,
  /** Extra months of lease paid when an aircraft is handed back early (on top of the forfeited deposit). */
  earlyReturnMonths: 3,
  aircraftOverheadPerDay: 600,
  /** Rival fares and capacity respond to LF: raise above, cut below. */
  yieldHighLF: 0.86, yieldLowLF: 0.68, yieldUp: 0.012, yieldDown: 0.012, fareCeiling: 1.12,
  /** A competitor fare this far below the rival's base fare counts as an undercut. */
  undercutThreshold: 0.06,
  /** Competitors with fewer seats than this share of the rival's own are ignored (except entries by anyone). */
  undercutMinSeatShare: 0.1,
  fareStepPerWeek: 0.5,
  relaxPerWeek: 0.04,
  announceCutPct: 0.07, announceCooldownDays: 56,
  /** Growth rule (monthly): grow when LF and margin are high, cut when low. */
  growLF: 0.82, growMargin: 0.06, shrinkLF: 0.6, shrinkMargin: -0.08,
  /** Exit review (quarterly): route is a loser when estimated avg weekly profit after fractional ownership is below this share of revenue. */
  exitMargin: -0.05, exitQuarters: 2, minRouteAgeWeeks: 26, reentryCooldownDays: 730,
  entriesPerQuarter: 2,
  /** Staying power. */
  distressWeeksOfCost: 6, distressLossWeeks: 26, shrinkRoutesPerMonth: 1,
  bankruptNegCashWeeks: 26, bankruptDeepWeeksOfCost: 26,
  /** Dividends (monthly): pay this share of cash above cap x initial cash. */
  dividendCapMultiple: 1.6, dividendShare: 0.5,
  optimismStd: 0.07,
  /** Extra optimism of a startup (founders overestimate their markets). */
  startupOptimism: 0.1,
  /** Random startup chance per year (checked annually from 2018 while fewer than `maxActive` rivals are active). */
  randomEntrantChancePerYear: 0.1, randomEntrantFromYear: 2018, maxActive: 8, entrantCash: 70_000_000,
  newsLimit: 300,
} as const;
