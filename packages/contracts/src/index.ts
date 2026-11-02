// Shared types between sim, data and app. Change only via PR touching this file alone.
// Units: distances km, money USD, time in sim-minutes since campaign start unless noted.

export type Id = string;
export type Seed = number;

/** Calendar day index since campaign start (day 0 = 2015-01-01). */
export type Day = number;

export type CabinClass = "F" | "J" | "W" | "Y"; // first, business, premium economy, economy

export interface Airport {
  id: Id; // IATA code
  name: string;
  city: string;
  lat: number;
  lon: number;
  region: "CA" | "HI" | "OR" | "WA";
  runwayM: number; // longest runway
  metroPopulation: number;
  gdpPerCapita: number;
  tourismIndex: number; // 0..1
  slotsPerHour: number;
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
}

// --- Sim <-> UI messages ---

export type Command =
  | { kind: "setSpeed"; speed: 0 | 1 | 2 | 3 | 4 | 5 }
  | { kind: "openRoute"; route: Omit<Route, "id"> }
  | { kind: "updateRoute"; id: Id; patch: Partial<Omit<Route, "id">> }
  | { kind: "closeRoute"; id: Id }
  | { kind: "orderAircraft"; typeId: Id; count: number; layout: CabinLayout };

export type SimEvent =
  | { kind: "tick"; day: Day }
  | { kind: "finance"; snapshot: FinanceSnapshot }
  | { kind: "notice"; day: Day; text: string };
