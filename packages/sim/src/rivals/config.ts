import type { Archetype, RivalScope } from "./types";

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
    estimateNoise: 0.18, indirectCostPct: 0.155, minEntryProfitPerWeek: 12_000, minEntryMargin: 0.05,
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
    estimateNoise: 0.22, indirectCostPct: 0.105, minEntryProfitPerWeek: 8_000, minEntryMargin: 0.04,
    corporateOverheadPerDay: 5_000, reserveWeeks: 8, maxRoutes: 32,
    candidate: { minKm: 250, maxKm: 4300, minDemand: 400, minMetro: 400_000, minSlots: 15, interislandOnly: false },
    types: ["B737-800", "A320", "B737-700", "A319", "A321", "B737-8", "A320N", "A321N", "B737-900ER"],
    maxAgeYears: 22,
  },
  regional: {
    label: "Regional/commuter",
    seatDensity: 0.92, premiumSeatShare: 0, premiumFareMult: 1, fareFactor: 1.12, quality: 0.46,
    minFrequency: 7, maxEntryFrequency: 24, maxFrequency: 70, entryShare: 0.45,
    maxFareCut: 0.15, floorFareFactor: 0.8, matchFactor: 1.05, memoryDays: 60, cooldownDays: 45, freqResponse: true,
    estimateNoise: 0.28, indirectCostPct: 0.155, minEntryProfitPerWeek: 4_000, minEntryMargin: 0.06,
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
    estimateNoise: 0.2, indirectCostPct: 0.13, minEntryProfitPerWeek: 5_000, minEntryMargin: 0.06,
    corporateOverheadPerDay: 4_000, reserveWeeks: 10, maxRoutes: 20,
    candidate: { minKm: 40, maxKm: 600, minDemand: 200, minMetro: 0, minSlots: 4, interislandOnly: true },
    types: ["B737-700", "A319", "ATR72-600", "CRJ700"],
    maxAgeYears: 26,
  },
};

/**
 * Market search areas. The original West Coast field keeps the old four states (the calibration of the 60-airport world), the new
 * national and European carriers look across their whole country or continent.
 */
export const SCOPES = {
  pacific: { states: ["CA", "HI", "OR", "WA"] },
  pacificNorthwest: { states: ["OR", "WA", "CA"] },
  hawaii: { states: ["HI"] },
  us: { states: [] as string[], countries: ["US"] },
  usTransatlantic: { states: [] as string[], countries: ["US"], transatlantic: true },
  europe: { countries: ["EUROPE"] },
  europeTransatlantic: { countries: ["EUROPE"], transatlantic: true },
  nordic: { countries: ["NO", "SE", "DK", "FI", "IS"] },
} as const satisfies Record<string, RivalScope>;

/** European type preference (Airbus-led; the same real types from packages/data). */
export const EUROPE_LEGACY_TYPES = ["A320", "A319", "A321", "A220-300", "A321N", "A320N", "B737-800", "B737-8", "A330-300", "A330-200", "A350-900", "B787-9", "B777-300ER", "B787-8", "A330-900", "A350-1000"];
export const EUROPE_LCC_TYPES = ["A320", "B737-800", "A321", "A320N", "A319", "B737-8", "A321N", "B737-700"];
export const US_LEGACY_TYPES = ["B737-800", "A320", "B737-900ER", "A321", "B757-200", "B737-8", "A321N", "A320N", "B737-9", "B767-300ER", "A330-300", "A330-200", "B777-200ER", "B787-8", "B787-9", "B777-300ER", "A350-900", "A330-900"];

export interface StartingRivalSpec {
  id: string;
  name: string;
  archetype: Archetype;
  bases: string[];
  cash: number;
  /** Where the airline looks for markets (default: derived from the archetype, see `scopeOf`). */
  scope?: RivalScope;
  typePrefs?: string[];
  maxRoutes?: number;
  /** Routes: origin, destination, share of the potential market (seat share at 80% load). */
  routes: ReadonlyArray<readonly [string, string, number]>;
  /** Networks built at set-up: this many routes picked from the best candidate markets near the bases (after the explicit `routes`). */
  seedRoutes?: number;
}

/**
 * The 2015 field. Fictional names. Shares are of `baseWeeklyDemand`; frequencies and fleets are derived from them at
 * set-up, so nothing here is a claimed real-world figure. A route that no allowed aircraft can fly (`canFlyRoute`) is skipped.
 */
export const STARTING_RIVALS: StartingRivalSpec[] = [
  {
    id: "pacific-crown", name: "Pacific Crown", archetype: "legacy", bases: ["SFO", "LAX"], cash: 450_000_000, scope: SCOPES.pacific,
    routes: [
      ["SFO", "LAX", 0.3], ["SFO", "SAN", 0.18], ["SFO", "BUR", 0.12], ["SFO", "SNA", 0.14], ["SFO", "ONT", 0.1],
      ["LAX", "SJC", 0.1], ["LAX", "SMF", 0.1], ["LAX", "OAK", 0.06],
      ["SFO", "HNL", 0.24], ["SFO", "OGG", 0.24], ["SFO", "KOA", 0.16], ["SFO", "LIH", 0.16],
      ["LAX", "HNL", 0.3], ["LAX", "OGG", 0.3], ["LAX", "KOA", 0.14], ["LAX", "LIH", 0.14],
      // Pacific Northwest trunks (OR/WA).
      ["SFO", "SEA", 0.3], ["SFO", "PDX", 0.25],
    ],
  },
  {
    id: "kestrel-air", name: "Kestrel Air", archetype: "lcc", bases: ["SAN", "OAK"], cash: 180_000_000, scope: SCOPES.pacific,
    routes: [
      ["SAN", "OAK", 0.2], ["SAN", "SMF", 0.2], ["SAN", "SFO", 0.16], ["SAN", "SJC", 0.12],
      ["OAK", "LAX", 0.14], ["OAK", "BUR", 0.14], ["OAK", "SNA", 0.14], ["OAK", "LGB", 0.12],
      ["OAK", "HNL", 0.12], ["OAK", "OGG", 0.12], ["SAN", "HNL", 0.08],
      ["OAK", "SEA", 0.14], ["OAK", "PDX", 0.14], ["SAN", "SEA", 0.14], ["SAN", "PDX", 0.1],
      // Trunk routes the player also flies: several carriers share them, as on the real LAX-SFO and LAX-Hawaii markets.
      ["LAX", "SFO", 0.2], ["LAX", "HNL", 0.28], ["LAX", "SAN", 0.6],
    ],
  },
  {
    id: "golden-state-express", name: "Golden State Express", archetype: "regional", bases: ["LAX", "SFO"], cash: 90_000_000, scope: SCOPES.pacific,
    routes: [
      ["LAX", "SBA", 0.3], ["LAX", "MRY", 0.3], ["LAX", "SBP", 0.35], ["LAX", "PSP", 0.25], ["LAX", "FAT", 0.3],
      ["LAX", "MMH", 0.5], ["SFO", "ACV", 0.5], ["SFO", "RDD", 0.4], ["SFO", "SBA", 0.25], ["SFO", "FAT", 0.2],
      ["SFO", "PSP", 0.2], ["LAX", "RDD", 0.2],
      ["SFO", "MFR", 0.4], ["SFO", "RDM", 0.35], ["SFO", "EUG", 0.3], ["SFO", "OTH", 0.5],
    ],
  },
  {
    id: "islander", name: "Islander", archetype: "interisland", bases: ["HNL", "OGG"], cash: 120_000_000, scope: SCOPES.hawaii,
    routes: [
      ["HNL", "OGG", 0.32], ["HNL", "KOA", 0.32], ["HNL", "LIH", 0.32], ["HNL", "ITO", 0.3], ["OGG", "KOA", 0.25],
      ["OGG", "LIH", 0.2], ["HNL", "MKK", 0.5], ["HNL", "LNY", 0.5], ["OGG", "ITO", 0.15],
    ],
  },
  {
    id: "sierra-jet", name: "Sierra Jet", archetype: "lcc", bases: ["SMF", "SJC"], cash: 130_000_000, scope: SCOPES.pacific,
    routes: [
      ["SMF", "LAX", 0.14], ["SMF", "SAN", 0.18], ["SMF", "BUR", 0.14], ["SMF", "SNA", 0.12], ["SMF", "ONT", 0.1],
      ["SJC", "SAN", 0.14], ["SJC", "LAX", 0.14], ["SJC", "SNA", 0.1], ["SMF", "HNL", 0.1], ["SJC", "HNL", 0.1],
      ["SMF", "OGG", 0.1], ["SJC", "OGG", 0.1], ["SMF", "LGB", 0.1], ["LAX", "OGG", 0.2],
      ["SMF", "SEA", 0.12], ["SMF", "PDX", 0.12], ["SJC", "SEA", 0.1],
    ],
  },
  // --- Whole-US and European field (all names fictional). Cash and fleets are sized so that margins land in the 5-12% band of BALANCE.md.
  {
    id: "cardinal-air", name: "Cardinal Air", archetype: "legacy", bases: ["ATL", "DFW"], cash: 800_000_000, scope: SCOPES.usTransatlantic,
    typePrefs: US_LEGACY_TYPES, maxRoutes: 44, routes: [], seedRoutes: 22,
  },
  {
    id: "polaris-air", name: "Polaris Air", archetype: "legacy", bases: ["ORD", "JFK"], cash: 750_000_000, scope: SCOPES.usTransatlantic,
    typePrefs: US_LEGACY_TYPES, maxRoutes: 44, routes: [], seedRoutes: 22,
  },
  {
    id: "sunbird-express", name: "Sunbird Express", archetype: "lcc", bases: ["MCO", "FLL"], cash: 300_000_000, scope: SCOPES.us,
    maxRoutes: 36, routes: [], seedRoutes: 18,
  },
  {
    id: "rheinland-air", name: "Rheinland Air", archetype: "legacy", bases: ["FRA", "MUC"], cash: 700_000_000, scope: SCOPES.europeTransatlantic,
    typePrefs: EUROPE_LEGACY_TYPES, maxRoutes: 44, routes: [], seedRoutes: 22,
  },
  {
    id: "gallia-air", name: "Gallia Air", archetype: "legacy", bases: ["CDG", "NCE"], cash: 600_000_000, scope: SCOPES.europeTransatlantic,
    typePrefs: EUROPE_LEGACY_TYPES, maxRoutes: 40, routes: [], seedRoutes: 20,
  },
  {
    id: "verdant-jet", name: "Verdant Jet", archetype: "lcc", bases: ["DUB", "STN"], cash: 350_000_000, scope: SCOPES.europe,
    typePrefs: EUROPE_LCC_TYPES, maxRoutes: 40, routes: [], seedRoutes: 20,
  },
  {
    id: "tramontana-jet", name: "Tramontana Jet", archetype: "lcc", bases: ["BCN", "BGY"], cash: 250_000_000, scope: SCOPES.europe,
    typePrefs: EUROPE_LCC_TYPES, maxRoutes: 34, routes: [], seedRoutes: 16,
  },
  {
    id: "fjord-connect", name: "Fjord Connect", archetype: "regional", bases: ["OSL", "BGO"], cash: 90_000_000, scope: SCOPES.nordic,
    typePrefs: ["E175", "CRJ900", "CRJ700", "ATR72-600", "A220-100"], routes: [], seedRoutes: 8,
  },
];

export interface EntrantSpec {
  id: string;
  name: string;
  archetype: Archetype;
  bases: string[];
  cash: number;
  scope?: RivalScope;
  typePrefs?: string[];
  maxRoutes?: number;
  /** Launch date as years since 2015-01-01 (fractional); jittered by +/- `jitterDays` from the seed. */
  launchYear: number;
  jitterDays: number;
  initialRoutes: number;
}

/** Scheduled new entrants (rare). Random extra entrants: see RIVAL_PARAMS.randomEntrantChancePerYear. */
export const SCHEDULED_ENTRANTS: EntrantSpec[] = [
  { id: "ember-air", name: "Ember Air", archetype: "lcc", bases: ["LAX", "SNA"], cash: 70_000_000, scope: SCOPES.pacific, launchYear: 2.3, jitterDays: 90, initialRoutes: 4 },
  // Pacific Northwest regional (Seattle and Portland); routes are chosen from the candidate list at launch.
  { id: "cascade-connect", name: "Cascade Connect", archetype: "regional", bases: ["SEA", "PDX"], cash: 90_000_000, scope: SCOPES.pacific, launchYear: 0.5, jitterDays: 60, initialRoutes: 6 },
];

/** Names for random startups. Fictional. */
export const ENTRANT_NAME_POOL = ["Halcyon Jet", "Redwood Wings", "Tradewind Air", "Cormorant Air", "Mesa Flyer", "Lumen Air", "Aspen Wings", "Corvus Air", "Saltire Jet", "Meltemi Air"];

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
  randomEntrantChancePerYear: 0.1, randomEntrantFromYear: 2018, maxActive: 20, entrantCash: 70_000_000,
  newsLimit: 900,
} as const;

/**
 * The generated world field (owner, 20 Nov 2026; rivals/world.ts). Every figure here is a game-design choice, not real-world data:
 * 50 airlines with hubs at 50 different airports of the top 100 by the model's own demand, the same hub and outstation rules as the
 * player (fleet/hubs.ts OUTSTATION_PARAMS), and decisions spread over an 8-week cycle so only about 6 airlines decide in any week.
 */
/** How hard the world field competes (owner, 22 Nov 2026: easy / medium / hard at game start). Medium is the field as tuned before. */
export interface WorldIntensity {
  /** Airlines in the field (and the startup target). */
  airlines: number;
  /** Weeks between an airline's decisions (each still decides on its own week). */
  decisionCycleWeeks: number;
  /** New markets an airline may enter at each decision. */
  entriesPerDecision: number;
  /** Multiplier on WORLD_FIELD.entryShare: how much of a market a new route is sized for. */
  entryShareScale: number;
  /** Added to every world airline's indirect cost share: positive = weaker airlines that fail sooner, negative = leaner ones. */
  overheadDelta: number;
  /** Airlines placed at the player's home hub and the nearest top airports to it, so the player's own markets are contested. */
  homeRivals: number;
  /**
   * Share of each of the player's starting markets that rival incumbents already cover on day one (seats for that share of the carried
   * demand at the rivals' 80% target load; rivals/engine.ts seedIncumbents). Without them the starting routes face only the outside
   * option and a passive start earns about 45% net margin (balance probe, 22 Nov 2026). Absent in saves from before it existed (only
   * read when a game is created).
   */
  startCoverage?: number;
}

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Difficulty presets: starting cash and world-field intensity. Game-design values, not data. Medium is the game as calibrated on
 * 20 Nov 2026 (50 airlines, 8-week cycle, two entries per decision, USD 150M). Easy: more cash, fewer and slower rivals that size
 * routes smaller and carry more overhead, none placed at the player's hub. Hard: less cash, more and faster rivals, bigger entries,
 * leaner costs, and three airlines based at or near the player's hub, so the starting routes have competition from day one.
 */
export const DIFFICULTY: Record<Difficulty, { startingCashUsd: number; intensity: WorldIntensity }> = {
  easy: { startingCashUsd: 250_000_000, intensity: { airlines: 35, decisionCycleWeeks: 10, entriesPerDecision: 1, entryShareScale: 0.8, overheadDelta: 0.03, homeRivals: 0, startCoverage: 0.65 } },
  medium: { startingCashUsd: 150_000_000, intensity: { airlines: 50, decisionCycleWeeks: 8, entriesPerDecision: 2, entryShareScale: 1, overheadDelta: 0, homeRivals: 1, startCoverage: 0.8 } },
  hard: { startingCashUsd: 90_000_000, intensity: { airlines: 65, decisionCycleWeeks: 6, entriesPerDecision: 3, entryShareScale: 1.2, overheadDelta: -0.03, homeRivals: 3, startCoverage: 1 } },
};

/**
 * The field gets tougher with time (owner, 26 Nov 2026: "competitive within about 10 years"). Over RAMP.years from the start of the
 * game, linearly: more market entries per decision, larger entries, shorter decision cycles, leaner overheads (applied yearly to each
 * airline, rivals/index.ts), more outstations, and growing aggression toward the player's markets (rivals/engine.ts: profitable player
 * markets score higher, the player's bases are favoured for outstations, and startups launch at the player's hub). Game-design values.
 */
export const RAMP = {
  years: 10,
  extraEntries: 2,
  entryShareGain: 0.35,
  cycleWeeksCut: 3,
  minCycleWeeks: 4,
  overheadCutPerYear: 0.0035,
  overheadCutMax: 0.035,
  extraOutstations: 3,
  /** Aggression toward the player at the end of the ramp, and the extra for an airline the player turned down (market/hostileUntil). */
  aggressionMax: 1,
  hostileAggression: 0.8,
  /** Score multiplier on a player market: 1 + playerMarketBonus x aggression. */
  playerMarketBonus: 0.9,
  /** Chance a startup launches at the player's home hub, at full aggression. */
  homeStartupChance: 0.5,
} as const;

/** Ramp progress, 0 at the start of the game to 1 after RAMP.years. */
export const rampProgress = (years: number): number => Math.max(0, Math.min(1, years / RAMP.years));

/** The difficulty's intensity after `years` of play (see RAMP). */
export function rampedIntensity(base: WorldIntensity, years: number): WorldIntensity {
  const t = rampProgress(years);
  return {
    ...base,
    entriesPerDecision: base.entriesPerDecision + Math.round(RAMP.extraEntries * t),
    entryShareScale: base.entryShareScale * (1 + RAMP.entryShareGain * t),
    decisionCycleWeeks: Math.max(RAMP.minCycleWeeks, base.decisionCycleWeeks - Math.round(RAMP.cycleWeeksCut * t)),
  };
}

/** Intensity of a rival state (absent in older saves and the classic field: medium). */
export const intensityOf = (rivals: { intensity?: WorldIntensity } | null | undefined): WorldIntensity => rivals?.intensity ?? DIFFICULTY.medium.intensity;

export const WORLD_FIELD = {
  airlines: 50,
  topAirports: 100,
  /** Each airline decides once per cycle, in its own week (assigned at the start so every week has about the same number). */
  decisionCycleWeeks: 8,
  /** Archetype mix of the generated airlines (interisland is not generated). */
  mix: [["legacy", 0.35], ["lcc", 0.4], ["regional", 0.25]] as ReadonlyArray<readonly [Archetype, number]>,
  /** Starting network size per archetype: [min, max] routes. */
  seedRoutes: { legacy: [12, 22], lcc: [10, 18], regional: [6, 12], interisland: [6, 10] } as Record<Archetype, readonly [number, number]>,
  /** Opening cash per starting route (USD). */
  cashPerRoute: { legacy: 30_000_000, lcc: 16_000_000, regional: 9_000_000, interisland: 9_000_000 } as Record<Archetype, number>,
  maxRoutes: { legacy: 60, lcc: 48, regional: 30, interisland: 24 } as Record<Archetype, number>,
  /** Legacy carriers may fly long-haul from their bases up to this distance (widebodies; feasibility from the aircraft data). */
  legacyMaxKm: 12_000,
  entriesPerDecision: 2,
  /** Outstations: at most this many per airline; considered once it flies this many routes; chance per decision. */
  maxOutstations: 4, outstationMinRoutes: 8, outstationChance: 0.2,
  /** Order lead time in months (from order to delivery), uniform in the range. Shorter than the player's factory slots: rivals also use lessors. */
  leadMonths: { narrow: [4, 12], wide: [8, 18] } as Record<"narrow" | "wide", readonly [number, number]>,
  /** Routes waiting for aircraft are dropped after this many days. */
  pendingMaxDays: 730,
  maxPending: 4,
  /** Fare policy review: network load factor above `highLF` raises the fare level by `step`, below `lowLF` lowers it. */
  fareLevel: { step: 0.03, min: 0.85, max: 1.2, highLF: 0.82, lowLF: 0.72 },
  /**
   * Yield-management ceiling (multiple of the archetype fare x fare level); the classic field uses RIVAL_PARAMS.fareCeiling 1.12.
   * Higher here because no stand-in rivals absorb demand, so sold-out markets must be able to price up (balance probe, 20 Nov 2026).
   */
  fareCeiling: 1.2,
  /**
   * Share of the carried market a new route is sized for (seats at 80% load). The classic field uses ARCHETYPES entryShare
   * (0.17-0.45) because the stand-in rivals carry the rest; here nobody does (balance probe, 20 Nov 2026).
   */
  entryShare: { legacy: 0.6, lcc: 0.5, regional: 0.7, interisland: 0.6 } as Record<Archetype, number>,
  /** Extra indirect cost share of revenue on top of the archetype's, calibrated so median margins land near the 5-15% band. */
  extraIndirectPct: { legacy: 0.13, lcc: 0.12, regional: 0.02, interisland: 0.02 } as Record<Archetype, number>,
  /** Most rival airlines placed on one of the player's starting markets at creation (WorldIntensity.startCoverage). Design choice. */
  maxStartIncumbents: 4,
  /** At most this many of the player's starting markets per incumbent airline, so one exit does not uncover several. Design choice. */
  maxStartMarketsPerAirline: 2,
  /** Starting markets at least this long (km) take network (legacy) incumbents first. Design choice. */
  incumbentLongHaulKm: 3000,
  /** Seats of a rival leg offered to connecting passengers on its one-stop itineraries (share of the leg's seats). Assumption. */
  connectingSeatShare: 0.3,
  /** A new startup each year while fewer than `airlines` are active, with this chance. */
  startupChancePerYear: 0.6,
  startupCash: [60_000_000, 160_000_000] as readonly [number, number],
} as const;

/** Word lists for generated airline names (fictional combinations; checked not to spell a real airline in the tests' list). */
export const WORLD_NAME_FIRST = [
  "Amber", "Azure", "Basalt", "Birch", "Bramble", "Cedar", "Cinder", "Cobalt", "Copper", "Coral", "Crimson", "Dune", "Ember", "Fable",
  "Fern", "Flint", "Garnet", "Glacier", "Granite", "Harbor", "Hazel", "Indigo", "Ivory", "Jade", "Juniper", "Lantern", "Larch", "Linden",
  "Maple", "Marble", "Mistral", "Nimbus", "Obsidian", "Ochre", "Onyx", "Opal", "Orchid", "Pebble", "Quartz", "Quill", "Rowan", "Russet",
  "Saffron", "Sable", "Slate", "Sorrel", "Tamarind", "Thistle", "Topaz", "Umber", "Velvet", "Willow", "Zephyr",
];
export const WORLD_NAME_SECOND = ["Air", "Airways", "Jet", "Wings", "Express", "Connect", "Aviation", "Skies"];
