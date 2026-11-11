// End of campaign: the end date, the one-time review, the score. Pure and deterministic: the end day is fixed when the game starts,
// so nothing here reads a clock.
//
//   equity = cash + depreciated value of the aircraft we own outright + value of purchased aircraft not yet delivered
//            - purchase balances still owed on those aircraft
//   The undelivered aircraft count at the price paid (the value we will receive), so a pending order nets to the deposit already paid
//   instead of looking like a pure debt. Leased aircraft count for nothing either way: no equity, and the down payment is sunk.
//   grade  = equity as a multiple of the starting cash: A 3x or more, B 2x, C 1x, D 0x (not negative), F below zero
//
// Cash below zero is already debt (the credit line, finance/credit.ts), so it is not subtracted a second time.
import type { Day, Id } from "@arg/contracts";
import { fleetCollateralUsd, isBankrupt, orderedAircraftValueUsd, scheduledBalances } from "../finance/credit";
import { ownedHubsOf } from "../fleet/hubs";
import { dayToDate, jan1Day } from "../time/calendar";
import type { CampaignState, SimState } from "../state";

export const MAX_CAMPAIGN_YEARS = 50;

/** Campaign state of a game, or undefined for an endless game or a save from before campaigns. */
export const campaignOf = (state: Pick<SimState, "campaign">): CampaignState | undefined => state.campaign;

/** The campaign state a new game starts with: `years` from the start year, or null for an endless game (no campaign state). */
export function startCampaign(startYear: number, years: number | null | undefined, startCashUsd: number): CampaignState | undefined {
  if (years === undefined || years === null) return undefined;
  if (!Number.isInteger(years) || years < 1 || years > MAX_CAMPAIGN_YEARS) {
    throw new Error(`campaignYears must be a whole number from 1 to ${MAX_CAMPAIGN_YEARS}, or null for an endless game`);
  }
  const startDay = jan1Day(startYear);
  return { startDay, endDay: jan1Day(startYear + years), reviewDay: null, startCashUsd, profitByYear: {}, peakCashUsd: startCashUsd };
}

/** True when the campaign has reached its end date and the review has not been dismissed. Never for a bankrupt game. */
export function campaignReviewDue(state: SimState): boolean {
  const c = campaignOf(state);
  return !isBankrupt(state) && c?.endDay != null && state.world.day >= c.endDay;
}

/**
 * Freeze the sim at the end date and record the day the review was first reached (kept once; a later call changes nothing).
 * Returns the same object when nothing needs changing.
 */
export function markCampaignReview(state: SimState): SimState {
  if (!campaignReviewDue(state)) return state;
  const c = campaignOf(state)!;
  if (c.reviewDay !== null && state.speed === 0) return state;
  return { ...state, speed: 0, campaign: { ...c, reviewDay: c.reviewDay ?? state.world.day } };
}

/** Add one day's profit to its calendar year and keep the peak cash. Returns the same object for an endless game. */
export function recordCampaignDay(state: SimState, profitUsd: number): SimState {
  const c = campaignOf(state);
  if (!c) return state;
  const year = String(dayToDate(state.world.day).year);
  return {
    ...state,
    campaign: {
      ...c,
      profitByYear: { ...c.profitByYear, [year]: (c.profitByYear[year] ?? 0) + profitUsd },
      peakCashUsd: Math.max(c.peakCashUsd, state.world.cash),
    },
  };
}

/** Dismiss the review and play on with no end date. Always allowed; an endless game stays endless. */
export function continueEndless(state: SimState): SimState {
  const c = campaignOf(state);
  if (!c || c.endDay === null) return state;
  return { ...state, campaign: { ...c, endDay: null } };
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

export type Grade = "A" | "B" | "C" | "D" | "F";

/** Lowest equity multiple of the starting cash for each grade (the first that the equity reaches). */
export const GRADE_MULTIPLES: ReadonlyArray<readonly [Grade, number]> = [["A", 3], ["B", 2], ["C", 1], ["D", 0]];

export interface CampaignScore {
  cashUsd: number;
  /** Depreciated value of owned aircraft (finance/credit.ts fleetCollateralUsd). */
  aircraftUsd: number;
  /** Value of purchased aircraft not yet delivered, at the price paid (finance/credit.ts orderedAircraftValueUsd). */
  orderedUsd: number;
  /** Purchase balances still owed on aircraft not yet delivered. */
  owedUsd: number;
  equityUsd: number;
  /** Equity divided by the starting cash. */
  multiple: number;
  grade: Grade;
}

export function gradeFor(equityUsd: number, startCashUsd: number): Grade {
  const m = startCashUsd > 0 ? equityUsd / startCashUsd : equityUsd >= 0 ? Infinity : -Infinity;
  for (const [g, min] of GRADE_MULTIPLES) if (m >= min) return g;
  return "F";
}

/** Final equity and its grade. Pure: takes the three figures so the formula can be tested on its own. */
export function scoreOf(input: { cashUsd: number; aircraftUsd: number; orderedUsd?: number; owedUsd: number; startCashUsd: number }): CampaignScore {
  const orderedUsd = input.orderedUsd ?? 0;
  const equityUsd = input.cashUsd + input.aircraftUsd + orderedUsd - input.owedUsd;
  const multiple = input.startCashUsd > 0 ? equityUsd / input.startCashUsd : 0;
  return { cashUsd: input.cashUsd, aircraftUsd: input.aircraftUsd, orderedUsd, owedUsd: input.owedUsd, equityUsd, multiple, grade: gradeFor(equityUsd, input.startCashUsd) };
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export interface ReviewFleetLine { typeId: Id; name: string; count: number }

export interface RivalComparison {
  /** Rival airlines still operating. */
  active: number;
  /** Rival airlines that failed during the campaign. */
  bankrupt: number;
  medianFleet: number;
  medianRoutes: number;
  medianCashUsd: number;
  /** 1 = largest fleet among the player and the active rivals. */
  fleetRank: number;
  /** 1 = most routes among the player and the active rivals. */
  routeRank: number;
}

export interface CampaignReview {
  airline: string;
  startYear: number;
  endYear: number;
  yearsPlayed: number;
  finalCashUsd: number;
  peakCashUsd: number;
  profitByYear: { year: number; profitUsd: number }[];
  totalProfitUsd: number;
  score: CampaignScore;
  /** Aircraft in service by type, largest first. */
  fleet: ReviewFleetLine[];
  fleetCount: number;
  onOrder: number;
  routes: number;
  /** Passengers over seats across all routes, per week; null when no route has seats. */
  averageLoadFactor: number | null;
  hubs: { id: Id; name: string }[];
  /** Null when the game has no rival field. */
  rivals: RivalComparison | null;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const hi = s[m] ?? 0;
  return s.length % 2 ? hi : ((s[m - 1] ?? 0) + hi) / 2;
};

/** The review of a campaign game (null for an endless game). Safe to call at any time; the card shows it once the review is due. */
export function campaignReview(state: SimState): CampaignReview | null {
  const c = campaignOf(state);
  if (!c) return null;
  const endDay: Day = c.endDay ?? state.world.day;
  const startYear = dayToDate(c.startDay).year;
  const endYear = dayToDate(endDay).year;

  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const inService = state.world.fleet.filter((a) => a.status !== "delivery");
  const byType = new Map<Id, number>();
  for (const a of inService) byType.set(a.typeId, (byType.get(a.typeId) ?? 0) + 1);
  const fleet = [...byType].map(([typeId, count]) => ({ typeId, name: types.get(typeId)?.name ?? typeId, count }))
    .sort((a, b) => b.count - a.count || (a.typeId < b.typeId ? -1 : 1));

  let seats = 0;
  let pax = 0;
  for (const r of state.world.routes) {
    const ev = state.routeReports[r.id]?.evaluation;
    if (!ev) continue;
    seats += ev.seatsPerWeek;
    pax += ev.passengersPerWeek;
  }

  const owed = scheduledBalances(state).reduce((s, b) => s + b.amountUsd, 0);
  const score = scoreOf({
    cashUsd: state.world.cash,
    aircraftUsd: fleetCollateralUsd(state),
    orderedUsd: orderedAircraftValueUsd(state),
    owedUsd: owed,
    startCashUsd: c.startCashUsd,
  });

  const years: number[] = [];
  for (let y = startYear; y < endYear; y++) years.push(y);
  const profitByYear = years.map((year) => ({ year, profitUsd: c.profitByYear[String(year)] ?? 0 }));
  const totalProfitUsd = profitByYear.reduce((s, p) => s + p.profitUsd, 0);

  const active = (state.rivals?.airlines ?? []).filter((r) => r.status === "active");
  const rivals: RivalComparison | null = state.rivals ? {
    active: active.length,
    bankrupt: state.rivals.airlines.length - active.length,
    medianFleet: median(active.map((r) => r.fleet.length)),
    medianRoutes: median(active.map((r) => r.routes.length)),
    medianCashUsd: median(active.map((r) => r.cash)),
    fleetRank: 1 + active.filter((r) => r.fleet.length > inService.length).length,
    routeRank: 1 + active.filter((r) => r.routes.length > state.world.routes.length).length,
  } : null;

  const names = new Map(state.airports.map((a) => [a.id, a.name]));
  return {
    airline: state.airlineName,
    startYear,
    endYear,
    yearsPlayed: endYear - startYear,
    finalCashUsd: state.world.cash,
    peakCashUsd: c.peakCashUsd,
    profitByYear,
    totalProfitUsd,
    score,
    fleet,
    fleetCount: inService.length,
    onOrder: state.world.fleet.length - inService.length,
    routes: state.world.routes.length,
    averageLoadFactor: seats > 0 ? pax / seats : null,
    hubs: ownedHubsOf(state).map((id) => ({ id, name: names.get(id) ?? id })),
    rivals,
  };
}
