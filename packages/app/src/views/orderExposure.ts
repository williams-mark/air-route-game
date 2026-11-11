import { deliveredCollateralUsd, FINANCING_PARAMS, fundingOutlook, orderFundingRefusal, type FundingOutlook, type ScheduledBalance, type SimState } from "@arg/sim";
import type { OrderItem } from "../sim/bridge";

/** Balance still owed on purchase orders at the aircraft not yet delivered (80% of the net price, paid in full on delivery day). Leases owe nothing at delivery. */
export function pendingBalanceUsd(orders: readonly Pick<OrderItem, "count" | "delivered" | "unitPriceUsd" | "financing">[]): number {
  let total = 0;
  for (const o of orders) {
    if (o.financing !== "purchase") continue;
    const left = Math.max(0, o.count - o.delivered);
    total += left * o.unitPriceUsd * (1 - FINANCING_PARAMS.purchaseDownFraction);
  }
  return total;
}

/** Whole aircraft count from the quantity field, or null when it is not a whole number from 1 to `max`. */
export function parseQuantity(qty: number, max: number): number | null {
  return Number.isInteger(qty) && qty >= 1 && qty <= max ? qty : null;
}

/** What the sim's order guard will say about a quote: a refusal (null = fundable) and the tightest point of cash plus credit line. */
export interface FundingQuote { refusal: string | null; outlook: FundingOutlook }

/**
 * Run the sim's own funding guard on a quote that has not been ordered yet. Delivery dates are not known until the order is placed,
 * so the new aircraft are assumed to arrive a year out; the sim's answer at order time is the authoritative one.
 */
export function orderFundingQuote(sim: SimState, q: { financing: "purchase" | "lease"; count: number; depositUsd: number; netUnitUsd: number; listEachUsd: number }): FundingQuote {
  const added: ScheduledBalance[] = q.financing === "purchase"
    ? Array.from({ length: q.count }, () => ({
      day: sim.world.day + 365, orderId: "quote", amountUsd: q.netUnitUsd * (1 - FINANCING_PARAMS.purchaseDownFraction), collateralUsd: deliveredCollateralUsd(q.listEachUsd),
    }))
    : [];
  return { refusal: orderFundingRefusal(sim, q.depositUsd, added), outlook: fundingOutlook(sim, q.depositUsd, added) };
}

/** Deposit forfeited and delivery balances relieved if the undelivered part of an order is cancelled (mirrors the sim's cancelOrder). */
export function cancelTerms(o: Pick<OrderItem, "count" | "delivered" | "unitPriceUsd" | "financing" | "depositUsd">): { aircraft: number; forfeitedUsd: number; relievedUsd: number } {
  const left = Math.max(0, o.count - o.delivered);
  return {
    aircraft: left,
    forfeitedUsd: (o.depositUsd / Math.max(1, o.count)) * left,
    relievedUsd: o.financing === "purchase" ? left * o.unitPriceUsd * (1 - FINANCING_PARAMS.purchaseDownFraction) : 0,
  };
}

/** A deposit above this needs an explicit confirm step before the order goes to the sim (a purchase always does). */
export const ORDER_CONFIRM_DEPOSIT_USD = 10_000_000;
/** After a successful order the button stays disabled this long (or until the quote changes), so a double or triple click cannot place it again. */
export const ORDER_LOCK_MS = 1500;

/** True when placing the order needs the confirm step: any purchase, or a deposit above `ORDER_CONFIRM_DEPOSIT_USD`. Small lease orders go straight through. */
export function needsOrderConfirm(financing: "purchase" | "lease", depositUsd: number): boolean {
  return financing === "purchase" || depositUsd > ORDER_CONFIRM_DEPOSIT_USD;
}

/** Identifies the quote the form is showing. Changing any input (type, quantity, financing, hub) is a new quote and clears the lock. */
export function orderQuoteKey(q: { typeId: string; count: number; financing: "purchase" | "lease"; deliveryHubId: string }): string {
  return `${q.typeId}|${q.count}|${q.financing}|${q.deliveryHubId}`;
}
