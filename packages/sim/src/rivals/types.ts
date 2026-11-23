import type { Aircraft, Day, Id } from "@arg/contracts";

export type Archetype = "legacy" | "lcc" | "regional" | "interisland";

export interface RivalAircraft {
  id: Id;
  typeId: Id;
  ageDays: number;
}

/** A route flown by a rival: `frequency` round trips a week (departures each way). */
export interface RivalRoute {
  id: Id;
  origin: Id;
  destination: Id;
  typeId: Id;
  frequency: number;
  seatsPerFlight: number;
  /** Fare the rival would charge absent a price war (economy-equivalent, USD). */
  baseFare: number;
  /** Fare currently charged. */
  fare: number;
  /** Last fare announced to the player (for "cut fares X%" notices). */
  announcedFare: number;
  enteredDay: Day;
  /** Last 13 weeks of true route profit before fleet cost, USD per week (newest last). */
  profitHist: number[];
  /** Last observed weekly load factor and margin (true values; decisions add noise). */
  loadFactor: number;
  revenue: number;
  margin: number;
  /** Consecutive quarterly reviews that judged the route a loser. */
  badQuarters: number;
  /** Frequency at the start of the current retaliation episode (cap for the frequency response). */
  baselineFrequency: number;
  lastNoticeDay: Day;
}

/** Memory of being undercut in one market. */
export interface RivalMemory {
  sinceDay: Day;
  untilDay: Day;
  /** Hard end: the episode never lasts beyond this even if the undercutter stays low. */
  maxUntilDay: Day;
  aggressor: string;
  /** Lowest rival/player fare that triggered or sustains the episode. */
  aggressorFare: number;
  active: boolean;
  /** Day a new episode may start (cooldown). */
  nextEpisodeDay: Day;
}

/**
 * Where a rival may look for markets. Either a list of US `states`, or `countries` (ISO codes; the token "EUROPE" stands for every
 * non-US country in the data), optionally with `transatlantic`: also long-haul pairs between its home region and the other side
 * (needs widebodies, `canFlyRoute` decides feasibility). Absent on airlines from older saves: derived from their bases (`scopeOf`).
 */
export interface RivalScope {
  states?: string[];
  countries?: string[];
  transatlantic?: boolean;
  /** Whole world (the generated field): no regional limit, and aircraft types follow the year (rivals/world.ts). */
  world?: boolean;
}

/** Aircraft ordered by a rival, arriving on `deliveryDay` (deposit paid at order). */
export interface RivalOrder {
  typeId: Id;
  count: number;
  deliveryDay: Day;
}

export interface RivalAirline {
  id: Id;
  name: string;
  /** World field: added to the airline's indirect cost share (WorldIntensity.overheadDelta). Absent = 0. */
  overheadDelta?: number;
  archetype: Archetype;
  bases: Id[];
  /** Home region and market search area (older saves: derived from the bases). */
  scope?: RivalScope;
  /** Aircraft type preference, first feasible wins (older saves and unset: the archetype list). */
  typePrefs?: string[];
  /** Route cap; unset = the archetype's. */
  maxRoutes?: number;
  status: "active" | "bankrupt";
  foundedDay: Day;
  bankruptDay: Day | null;
  cash: number;
  initialCash: number;
  fleet: RivalAircraft[];
  routes: RivalRoute[];
  memory: Record<string, RivalMemory>;
  /** Market key -> day before which the airline will not re-enter after leaving. */
  exitedUntil: Record<string, number>;
  /** Markets where the player's presence is already known (so only new player entries provoke). */
  playerSeen: string[];
  /** Persistent bias of this airline's profit estimates, as a fraction of route revenue (optimistic > 0). */
  optimism: number;
  /** Consecutive weeks of negative total profit. */
  lossWeeks: number;
  /** Consecutive weeks with negative cash. */
  negCashWeeks: number;
  /** Total airline profit, last week and last 52 weeks (true values, hidden from the player). */
  lastWeekProfit: number;
  profit52: number[];
  nextAircraft: number;
  nextRoute: number;
  // --- Generated world field only (rivals/world.ts); absent on the classic field and in older saves. ---
  /** Outstations: bases beyond the hub (`bases[0]`) where its flights may use at most WORLD_FIELD.outstationBlockHours a week. */
  outstations?: Id[];
  /** Week of the decision cycle (0 to WORLD_FIELD.decisionCycleWeeks - 1) on which the airline makes its decisions. */
  decisionWeek?: number;
  /** Last day it made its decisions. */
  lastDecisionDay?: Day;
  /** Aircraft on order. */
  orders?: RivalOrder[];
  /** Routes waiting for ordered aircraft; they open when the aircraft arrive. */
  pending?: RivalRoute[];
  /** Fare policy: multiple of its archetype fare on every route (1 = standard). */
  fareLevel?: number;
  /** Last annual fleet review. */
  lastFleetDay?: Day;
}

export type RivalNewsKind = "launch" | "enter" | "exit" | "fareCut" | "frequency" | "shrink" | "bankrupt" | "order" | "outstation" | "farePolicy";

/** Structured news for decision cards. `playerMarket` is true when the player flies the same airport pair. */
export interface RivalNewsItem {
  day: Day;
  kind: RivalNewsKind;
  rivalId: Id;
  rivalName: string;
  origin?: Id;
  destination?: Id;
  /** Fare cut or frequency change in percent (positive numbers). */
  pct?: number;
  frequency?: number;
  typeId?: Id;
  aircraft?: number;
  playerMarket: boolean;
  text: string;
}

export interface RivalsState {
  airlines: RivalAirline[];
  news: RivalNewsItem[];
  /** Entrant specs already launched. */
  launchedEntrants: string[];
  nextAirline: number;
  /** Campaign day the field was founded (the game's start). Scheduled entrants launch relative to it. Absent in older saves = day 0. */
  originDay?: number;
  /**
   * "world": the generated field of WORLD_FIELD.airlines airlines at the top airports (rivals/world.ts). The player then competes only
   * with these airlines (no synthetic stand-in rivals). Absent or "classic": the original named field plus the synthetic stand-ins.
   */
  field?: "classic" | "world";
  /** World field: how hard it competes (rivals/config.ts DIFFICULTY). Absent = medium. */
  intensity?: import("./config").WorldIntensity;
}

/** Fleet released by a bankrupt airline, for the offers lane (distressed lots). */
export interface BankruptcyRecord {
  lotId: Id;
  airlineId: Id;
  airlineName: string;
  archetype: Archetype;
  day: Day;
  /** Real contract aircraft (status 'active'), cabins from a default layout, ages as of the bankruptcy day. */
  aircraft: Aircraft[];
  /** Routes the airline flew at collapse. */
  routes: { origin: Id; destination: Id; frequency: number; typeId: Id }[];
}

/** What the player may know about a rival in one market (fog of war: schedule level only). */
export interface RivalMarketCarrier {
  rivalId: Id;
  name: string;
  archetype: Archetype;
  /** Round trips per week. */
  weeklyFrequency: number;
  /** One-way seats per week. */
  weeklySeats: number;
  typeId: Id;
  /** Estimated economy fare band, USD. */
  fareBand: { low: number; high: number };
}

export interface RivalMarketReport {
  origin: Id;
  destination: Id;
  carriers: RivalMarketCarrier[];
  totalWeeklySeats: number;
  playerFlies: boolean;
}
