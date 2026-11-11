// Credit line, overdraft interest, order funding guard, distress and bankruptcy. Pure and deterministic: no randomness, no clock.
//
//   credit limit = base + advance rate x value of owned aircraft + months of revenue
//   cash may go negative down to minus the limit; the overdrawn amount pays interest daily
//   cash below minus the limit is "distress": a grace period starts; cure it (close routes, cancel orders) or the airline fails
import type { Day, Id } from "@arg/contracts";
import { CREDIT_PARAMS, FINANCING_PARAMS, LIFECYCLE_PARAMS } from "../fleet/lifecycle";
import { usdM } from "../money";
import type { CreditState, SimState } from "../state";
import { dayLabel } from "../world/closures";

const EMPTY_CREDIT: CreditState = { distressSinceDay: null, lastReminderDay: null, lastInterestUsd: 0, interestPaidUsd: 0, bankrupt: null };
export const creditOf = (state: Pick<SimState, "credit">): CreditState => state.credit ?? EMPTY_CREDIT;
export const isBankrupt = (state: Pick<SimState, "credit">): boolean => state.credit?.bankrupt != null;

/** Depreciated value of the aircraft we own outright (delivered, bought with financing "purchase"); leased and pre-economics aircraft are not ours to pledge. */
export function fleetCollateralUsd(state: Pick<SimState, "world" | "aircraftTypes">): number {
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const life = LIFECYCLE_PARAMS.maxAgeYears * LIFECYCLE_PARAMS.daysPerYear;
  let total = 0;
  for (const ac of state.world.fleet) {
    if (ac.status === "delivery" || ac.financing !== "purchase") continue;
    const t = types.get(ac.typeId);
    if (!t) continue;
    const kept = Math.max(CREDIT_PARAMS.residualValueFraction, 1 - (1 - CREDIT_PARAMS.residualValueFraction) * (ac.ageDays / life));
    total += t.listPriceUsdM * 1e6 * kept;
  }
  return total;
}

/** Revenue per month (30.4375 days) averaged over the trailing window of daily snapshots; 0 before the first day. */
export function monthlyRevenueUsd(snapshots: SimState["snapshots"]): number {
  const w = snapshots.slice(-CREDIT_PARAMS.revenueWindowDays);
  if (w.length === 0) return 0;
  return (w.reduce((s, x) => s + x.revenue, 0) / w.length) * 30.4375;
}

/** How far cash may go below zero, USD. Never negative. */
export function creditLimitUsd(state: Pick<SimState, "world" | "aircraftTypes" | "snapshots">): number {
  return CREDIT_PARAMS.baseLimitUsd
    + CREDIT_PARAMS.fleetAdvanceRate * fleetCollateralUsd(state)
    + CREDIT_PARAMS.revenueMonths * monthlyRevenueUsd(state.snapshots);
}

/** A balance that falls due when an ordered aircraft is delivered, and the collateral the lender then gets (the credit line grows by it). */
export interface ScheduledBalance { day: Day; orderId: Id; amountUsd: number; collateralUsd: number }

/** What a new purchased aircraft of this list price adds to the credit limit on delivery (age 0, no depreciation yet). */
export const deliveredCollateralUsd = (listPriceUsd: number): number => CREDIT_PARAMS.fleetAdvanceRate * listPriceUsd;

/** Purchase balances still to pay (80% of the net price per undelivered aircraft), by delivery day, soonest first. Leases and offer orders owe nothing at delivery. */
export function scheduledBalances(state: Pick<SimState, "orders" | "world" | "fleetMeta" | "aircraftTypes">): ScheduledBalance[] {
  const waiting = new Set(state.world.fleet.filter((a) => a.status === "delivery").map((a) => a.id));
  const list = new Map(state.aircraftTypes.map((t) => [t.id, t.listPriceUsdM * 1e6]));
  const out: ScheduledBalance[] = [];
  for (const o of state.orders) {
    if (o.financing !== "purchase") continue;
    o.aircraftIds.forEach((id, i) => {
      if (!waiting.has(id)) return;
      const day = state.fleetMeta[id]?.deliveryDay ?? o.deliveryDays[i] ?? state.world.day;
      out.push({ day, orderId: o.id, amountUsd: o.unitPriceUsd * (1 - FINANCING_PARAMS.purchaseDownFraction), collateralUsd: deliveredCollateralUsd(list.get(o.typeId) ?? 0) });
    });
  }
  return out.sort((a, b) => a.day - b.day || (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0));
}

/** Where cash plus credit is tightest if the order goes ahead and no income arrives: the margin left, and when. */
export interface FundingOutlook { marginUsd: number; day: Day; cashUsd: number; limitUsd: number }

/**
 * Cash plus credit line over time with a deposit paid now and `newBalances` added to the open ones. Each delivery pays its balance
 * and adds its collateral to the line (the sim evaluates the limit with the aircraft in the fleet). Income is not counted.
 */
export function fundingOutlook(state: SimState, deposit: number, newBalances: readonly ScheduledBalance[]): FundingOutlook {
  const limit0 = creditLimitUsd(state);
  let cash = state.world.cash - deposit;
  let limit = limit0;
  let worst: FundingOutlook = { marginUsd: cash + limit, day: state.world.day, cashUsd: cash, limitUsd: limit };
  for (const b of [...scheduledBalances(state), ...newBalances].sort((a, c) => a.day - c.day)) {
    cash -= b.amountUsd;
    limit += b.collateralUsd;
    if (cash + limit < worst.marginUsd) worst = { marginUsd: cash + limit, day: b.day, cashUsd: cash, limitUsd: limit };
  }
  return worst;
}

export interface CreditStatus {
  limitUsd: number;
  /** Overdrawn amount (0 while cash is positive). */
  drawnUsd: number;
  /** Credit still available: limit minus drawn (negative in distress). */
  headroomUsd: number;
  annualRate: number;
  /** Interest per day at today's overdraft. */
  interestPerDayUsd: number;
  /** Balances due at delivery on open purchase orders. */
  owedAtDeliveryUsd: number;
  /** Cash after every scheduled balance is paid, ignoring income. */
  cashAfterBalancesUsd: number;
  /** Tightest point of cash plus credit line on open orders, ignoring income (below zero means the delivery balances are not covered). */
  worstMarginUsd: number;
  distress: { sinceDay: Day; daysLeft: number } | null;
  bankrupt: { day: Day } | null;
  interestPaidUsd: number;
}

export function creditStatus(state: SimState): CreditStatus {
  const limit = creditLimitUsd(state);
  const cash = state.world.cash;
  const drawn = Math.max(0, -cash);
  const owed = scheduledBalances(state).reduce((s, b) => s + b.amountUsd, 0);
  const c = creditOf(state);
  const outlook = fundingOutlook(state, 0, []);
  return {
    limitUsd: limit, drawnUsd: drawn, headroomUsd: limit - drawn, annualRate: CREDIT_PARAMS.annualInterestRate,
    interestPerDayUsd: (drawn * CREDIT_PARAMS.annualInterestRate) / 365, owedAtDeliveryUsd: owed, cashAfterBalancesUsd: cash - owed, worstMarginUsd: outlook.marginUsd,
    distress: c.distressSinceDay === null ? null : { sinceDay: c.distressSinceDay, daysLeft: Math.max(0, CREDIT_PARAMS.graceDays - (state.world.day - c.distressSinceDay)) },
    bankrupt: c.bankrupt, interestPaidUsd: c.interestPaidUsd,
  };
}

/** Daily interest for an overdrawn cash balance. */
export function overdraftInterestUsd(cash: number): number {
  return cash < 0 ? (-cash * CREDIT_PARAMS.annualInterestRate) / 365 : 0;
}

/**
 * Order guard. Projected cash is today's cash less the deposit and every balance due at delivery (income is not counted: it is
 * not promised), against a credit line that grows by the collateral of each delivered aircraft. It must stay within the line at
 * every delivery. Returns null when the order is fundable, else a player-facing refusal.
 */
export function orderFundingRefusal(state: SimState, deposit: number, newBalances: readonly ScheduledBalance[]): string | null {
  const o = fundingOutlook(state, deposit, newBalances);
  if (o.marginUsd >= 0) return null;
  if (o.day === state.world.day) {
    return `${usdM(deposit)} is due now but cash is ${usdM(state.world.cash)} and your credit line is ${usdM(o.limitUsd)}.`;
  }
  const total = scheduledBalances(state).reduce((s, x) => s + x.amountUsd, 0) + newBalances.reduce((s, x) => s + x.amountUsd, 0);
  const fromNew = newBalances.reduce((s, x) => s + x.amountUsd, 0);
  return `Not fundable: ${usdM(total)} of balances fall due at delivery (${usdM(fromNew)} from this order). `
    + `By ${dayLabel(o.day)} cash would be ${usdM(o.cashUsd)}, ${usdM(-o.marginUsd)} beyond your credit line of ${usdM(o.limitUsd)} (which grows as aircraft are delivered). `
    + `Order fewer aircraft, lease instead, or wait until income builds.`;
}

export interface CreditStep { credit: CreditState | undefined; notices: string[]; bankrupt: boolean }

/**
 * End-of-day credit bookkeeping. `prevCash` is cash at the start of the day, `interest` what was charged, `next` the state at the
 * start of the next day (cash and snapshots already updated). Returns the new credit state and notices; no change leaves it undefined.
 */
export function stepCredit(prev: SimState, next: SimState, interest: number): CreditStep {
  const cur = prev.credit;
  const cash = next.world.cash;
  const notices: string[] = [];
  const day = next.world.day;
  if (cur?.bankrupt) return { credit: cur, notices, bankrupt: true };
  const limit = creditLimitUsd(next);
  const inDistress = cash < -limit;
  let c: CreditState | undefined = cur;
  if (interest > 0 || cur) {
    c = { ...(cur ?? EMPTY_CREDIT), lastInterestUsd: interest, interestPaidUsd: (cur?.interestPaidUsd ?? 0) + interest };
  }
  if (prev.world.cash >= 0 && cash < 0) {
    notices.push(`Cash is below zero: you are using your credit line (${usdM(-cash)} of ${usdM(limit)}), at ${(CREDIT_PARAMS.annualInterestRate * 100).toFixed(0)}% interest a year.`);
  }
  if (inDistress) {
    c = c ?? { ...EMPTY_CREDIT, lastInterestUsd: interest };
    if (c.distressSinceDay === null) {
      c = { ...c, distressSinceDay: day, lastReminderDay: day };
      notices.push(`Financial distress: cash ${usdM(cash)} is ${usdM(-cash - limit)} beyond your ${usdM(limit)} credit line. You have ${CREDIT_PARAMS.graceDays} days to get back within it. Close routes that lose money, or cancel pending aircraft orders (the deposit is forfeited).`);
    } else if (day - c.distressSinceDay >= CREDIT_PARAMS.graceDays) {
      c = { ...c, bankrupt: { day } };
      notices.push(`Bankruptcy: cash stayed beyond the credit line for ${CREDIT_PARAMS.graceDays} days (${usdM(cash)} against a ${usdM(limit)} line). ${prev.airlineName} has ceased operations.`);
      return { credit: c, notices, bankrupt: true };
    } else if (day - (c.lastReminderDay ?? c.distressSinceDay) >= CREDIT_PARAMS.reminderDays) {
      const left = CREDIT_PARAMS.graceDays - (day - c.distressSinceDay);
      c = { ...c, lastReminderDay: day };
      notices.push(`Still in distress: cash ${usdM(cash)}, ${usdM(-cash - limit)} beyond the credit line. ${left} day${left === 1 ? "" : "s"} left before bankruptcy.`);
    }
  } else if (c && c.distressSinceDay !== null) {
    c = { ...c, distressSinceDay: null, lastReminderDay: null };
    notices.push(`Distress over: cash ${usdM(cash)} is back within your ${usdM(limit)} credit line.`);
  }
  return { credit: c, notices, bankrupt: false };
}
