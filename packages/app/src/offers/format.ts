import type { OfferKind } from "@arg/sim";
import type { OfferItem } from "../sim/bridge";
import { formatMonthYear } from "../sim/format";

export const KIND_BADGE: Record<OfferKind, string> = {
  launch: "Launch customer", endOfLife: "End of line", distressed: "Flash sale", used: "Used market",
};

export const MONTH_DAYS = 30.4375;

export function daysLeft(o: OfferItem, day: number): number {
  return Math.max(0, o.expiresDay - day);
}

export function closesIn(o: OfferItem, day: number): string {
  const d = daysLeft(o, day);
  return d <= 0 ? "Closes today" : d === 1 ? "Closes tomorrow" : `Closes in ${d} days`;
}

/** First and last delivery for `qty` aircraft if accepted today. */
export function deliveryWindow(o: OfferItem, day: number, qty: number): { first: number; last: number } {
  const first = Math.max(o.firstDeliveryDay, day + 7);
  return { first, last: first + Math.floor(Math.max(0, qty - 1) * o.deliveryGapDays) };
}

export function windowText(o: OfferItem, day: number, qty: number): string {
  const { first, last } = deliveryWindow(o, day, qty);
  const a = formatMonthYear(first);
  const b = formatMonthYear(last);
  if (first - day <= 60 && o.kind !== "launch") return last - first > 20 ? `Within weeks, through ${b}` : "Within weeks";
  return a === b ? a : `${a} to ${b}`;
}

/** "5 months later than a normal order" */
export function versusTypical(o: OfferItem): string | null {
  const months = Math.round((o.firstDeliveryDay - o.typicalFirstDeliveryDay) / MONTH_DAYS);
  if (months === 0) return null;
  return `${Math.abs(months)} month${Math.abs(months) === 1 ? "" : "s"} ${months > 0 ? "later" : "sooner"} than a normal order`;
}
