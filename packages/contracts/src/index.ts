// Shared types between sim, data and app. Change only via PR touching this file alone.
// Units: distances km, money USD, time in sim-minutes since campaign start unless noted.

export type Id = string;
export type Seed = number;

/** Calendar day index since campaign start (day 0 = 2015-01-01). */
export type Day = number;

export type CabinClass = "F" | "J" | "W" | "Y"; // first, business, premium economy, economy

/** Onboard service level of one cabin, set per airline (default standard). Affects passenger experience and premium fares. */
export type ServiceLevel = "basic" | "standard" | "superior";

export interface Airport {
  id: Id; // IATA code
  name: string;
  city: string;
  lat: number;
  lon: number;
  /** Subdivision: US state code ("CA", "TX", "HI") or, outside the US, the ISO 3166-1 alpha-2 country code ("GB", "DE"). */
  region: string;
  /** ISO 3166-1 alpha-2 country code ("US", "GB", "DE"). */
  country: string;
  /** Contiguous land mass used for surface-alternative and overwater rules ("US-CONUS", "US-HI", "US-AK", "EU-MAINLAND", "GB", "IE", ...). */
  landmass: string;
  runwayM: number; // longest runway
  metroPopulation: number;
  gdpPerCapita: number;
  tourismIndex: number; // 0..1
  slotsPerHour: number;
  /** Passenger terminals with slot-fee tiers. Absent = single undifferentiated terminal (fee multiplier 1). Sourced per airport in packages/data/SOURCES.md. */
  terminals?: Terminal[];
}

export interface Terminal {
  id: Id; // unique within the airport, e.g. "T3", "TBIT", "BRADLEY"
  name: string;
  /** Slot/gate fee multiplier relative to the airport base fee (1 = standard; premium terminals > 1, remote/satellite < 1). */
  feeMultiplier: number;
  premium: boolean;
  /** Share of the airport's slots this terminal can handle (0..1; terminals of an airport sum to about 1). */
  slotShare: number;
  /** Where the premium/fee tier comes from (URL or "estimate: ..."). */
  source: string;
}

/** Derived by the sim, never stored in saves. */
export interface HubCongestion {
  airportId: Id;
  slotsPerWeekTotal: number;
  slotsUsedByPlayer: number;
  slotsUsedByAll: number;
  slotsAvailable: number;
  terminals: { terminalId: Id; slotsUsedByPlayer: number; slotsCapacity: number; weeklyFeeUsd: number }[];
}

export type RouteCategory = "short" | "medium" | "long" | "ultra-long" | "hub-spoke" | "point-to-point" | "domestic" | "international";

/** A fare policy steers the target load factor of the routes it covers and sets the discount applied to connecting fares. */
export interface FarePolicy {
  id: Id;
  name: string;
  /** 0.5..0.95. Null = no target for covered routes (fares left alone). */
  targetLoadFactor: number | null;
  /** Average markdown on connecting fares vs the sum of direct fares, 0..0.5 (0.15 = 15% cheaper). */
  connectionMarkdown: number;
  /** "all" = every route; otherwise routes matching any listed category or id. */
  scope: "all" | { categories?: RouteCategory[]; routeIds?: Id[] };
}

export interface AircraftType {
  id: Id; // e.g. "B787-9"
  manufacturer: string;
  name: string;
  rangeKm: number;
  cruiseKmh: number;
  maxSeats: number;
  fuelBurnKgPerKm: number;
  runwayNeededM: number;
  listPriceUsdM: number;
  introYear: number;
  endYear: number | null;
  widebody: boolean;
}

export interface CabinSection {
  cls: CabinClass;
  rows: number;
  seatsAcross: number;
  pitchIn: number;
}

export interface CabinLayout {
  sections: CabinSection[];
}

export interface Aircraft {
  id: Id;
  typeId: Id;
  tailNumber: string;
  layout: CabinLayout;
  status: "active" | "maintenance" | "delivery" | "stored";
  ageDays: number;
  hoursSinceCheck: { A: number; B: number; C: number; D: number };
  /** Base hub airport id. Absent in older saves: the home hub (see sim fleet/hubs.ts). */
  hubId?: Id;
  /** How the aircraft was acquired. Absent = pre-economics aircraft (starting fleet, older saves): charged the lease-equivalent. */
  financing?: "purchase" | "lease";
}

export interface Fares {
  F?: number;
  J?: number;
  W?: number;
  Y: number;
}

export interface Route {
  id: Id;
  origin: Id;
  destination: Id;
  weeklyFrequency: number;
  fares: Fares;
  typeId: Id; // aircraft type the scheduler should plan with
  /** Target load factor (0.5..0.95). When set, the sim re-prices economy and premium fares weekly to steer toward it. */
  targetLoadFactor?: number;
}

export interface MarketSnapshot {
  origin: Id;
  destination: Id;
  weeklyDemand: number;
  playerShare: number;
  connectingShare: number;
  avgFare: number;
}

export interface FinanceSnapshot {
  day: Day;
  cash: number;
  revenue: number;
  costs: number;
  profit: number;
}

export interface WorldState {
  seed: Seed;
  day: Day;
  playerId: Id;
  cash: number;
  routes: Route[];
  fleet: Aircraft[];
  /** Player's home hub airport id. Absent = the sim's baseAirport, else LAX. */
  homeHub?: Id;
  /** Fare policies, applied in order; a later policy overrides an earlier one on the routes both cover. Route.targetLoadFactor, when set, overrides every policy. */
  farePolicies?: FarePolicy[];
  /** Terminal the player occupies at each hub, keyed by airport id. Absent = airport default (first non-premium terminal). */
  hubTerminals?: Record<Id, Id>;
  /** Service level per cabin for the player's airline. Absent = standard everywhere. */
  serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>;
  /** Hub airports the player owns, home hub included. Absent in older saves: derived from the home hub, fleet bases and terminals (sim fleet/hubs.ts). */
  ownedHubs?: Id[];
  /** Cash the player spent on hub unlocks and similar, oldest first. Absent until the first entry. */
  cashLog?: CashEntry[];
}

export interface CashEntry {
  day: Day;
  /** Negative for money paid out. */
  amountUsd: number;
  text: string;
}

// --- Sim <-> UI messages ---

export type Command =
  | { kind: "setSpeed"; speed: 0 | 1 | 2 | 3 | 4 | 5 }
  | { kind: "openRoute"; route: Omit<Route, "id"> }
  | { kind: "updateRoute"; id: Id; patch: Partial<Omit<Route, "id" | "targetLoadFactor">> & { targetLoadFactor?: number | null } }
  | { kind: "closeRoute"; id: Id }
  | { kind: "setFarePolicy"; policy: FarePolicy }
  | { kind: "removeFarePolicy"; id: Id }
  | { kind: "setHubTerminal"; airportId: Id; terminalId: Id }
  | { kind: "orderAircraft"; typeId: Id; count: number; layout: CabinLayout; financing?: "purchase" | "lease"; deliveryHubId?: Id }
  | { kind: "unlockHub"; airportId: Id };

export type SimEvent =
  | { kind: "tick"; day: Day }
  | { kind: "finance"; snapshot: FinanceSnapshot }
  | { kind: "notice"; day: Day; text: string };
