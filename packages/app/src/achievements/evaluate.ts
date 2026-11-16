// Pure achievement evaluation: plain facts about the running game in, earned ids and updated progress out.
// No DOM, no clock, no randomness. `facts.ts` builds the facts from the bridge; the unlock store in `store.ts` acts on the result.
import { jan1Day } from "@arg/sim";
import { LONG_HAUL_KM } from "./definitions";

/** What the evaluator needs to know about the game on one day. */
export interface Facts {
  /** Identifies the game (seed, airline, campaign start). A different key starts fresh progress. */
  gameKey: string;
  day: number;
  /** First day of the campaign (1 Jan of the start year); null for an endless game, whose start is then the first day seen. */
  campaignStartDay: number | null;
  /** The scripted 2020-2023 pandemic is on in this game. */
  pandemicOn: boolean;
  bankrupt: boolean;
  inDistress: boolean;
  /** Aircraft in the fleet that have been delivered. */
  fleetCount: number;
  routeIds: readonly string[];
  /** Longest great-circle distance among the current routes, km (0 with no routes). */
  longestRouteKm: number;
  hubCount: number;
  /** Grade on the end-of-campaign review while it is showing; null otherwise. */
  reviewGrade: "A" | "B" | "C" | "D" | "F" | null;
  /** Profit of the calendar year before the current one, USD, and how many of its days were recorded; null when not available. */
  lastYearProfit: { profitUsd: number; days: number } | null;
}

/** Memory kept across days for one game. Persisted by the store; plain JSON. */
export interface Progress {
  gameKey: string;
  /** First day this game was seen. */
  firstDay: number;
  lastDay: number;
  /** Routes that existed when the game was first seen (the starting network), which do not count as opened by the player. */
  baselineRouteIds: string[];
  distressSeen: boolean;
}

/** 1 January 2020 and 2021 as sim days. */
export const JAN_1_2020 = jan1Day(2020);
export const JAN_1_2021 = jan1Day(2021);
/** A calendar year needs this many recorded days to count as a full year. */
export const FULL_YEAR_DAYS = 360;

export function freshProgress(f: Facts): Progress {
  return { gameKey: f.gameKey, firstDay: f.day, lastDay: f.day, baselineRouteIds: [...f.routeIds], distressSeen: false };
}

export interface Evaluation {
  earned: ReadonlySet<string>;
  progress: Progress;
}

export function evaluate(f: Facts, prev: Progress | null): Evaluation {
  // A different game, or a day earlier than the last one seen (a save was loaded), starts the memory again.
  const p: Progress = prev && prev.gameKey === f.gameKey && f.day >= prev.lastDay ? { ...prev, lastDay: f.day } : freshProgress(f);
  if (f.inDistress) p.distressSeen = true;

  const earned = new Set<string>();
  const alive = !f.bankrupt;

  const baseline = new Set(p.baselineRouteIds);
  if (f.routeIds.some((id) => !baseline.has(id))) earned.add("FIRST_ROUTE");
  if (f.routeIds.length >= 25) earned.add("ROUTES_25");

  if (f.fleetCount >= 10) earned.add("FLEET_10");
  if (f.fleetCount >= 50) earned.add("FLEET_50");
  if (f.fleetCount >= 100) earned.add("FLEET_100");

  if (f.hubCount >= 2) earned.add("SECOND_HUB");
  if (f.hubCount >= 5) earned.add("FIVE_HUBS");

  if (f.lastYearProfit && f.lastYearProfit.days >= FULL_YEAR_DAYS && f.lastYearProfit.profitUsd > 0) earned.add("FIRST_PROFITABLE_YEAR");

  if (f.longestRouteKm > LONG_HAUL_KM) earned.add("LONG_HAUL");

  const startDay = f.campaignStartDay ?? p.firstDay;
  if (alive && f.pandemicOn && Math.min(startDay, p.firstDay) < JAN_1_2020 && f.day >= JAN_1_2021) earned.add("PANDEMIC_SURVIVOR");

  if (alive && p.distressSeen && !f.inDistress) earned.add("DISTRESS_RECOVERY");

  if (alive && (f.reviewGrade === "A" || f.reviewGrade === "B")) earned.add("CAMPAIGN_GRADE_B");
  if (alive && f.reviewGrade === "A") earned.add("CAMPAIGN_GRADE_A");

  return { earned, progress: p };
}
