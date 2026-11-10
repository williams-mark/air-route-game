import { FINANCING_PARAMS } from "@arg/sim";
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
