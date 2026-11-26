import type { Day, Id } from "@arg/contracts";

/** One month-end valuation sample. */
export interface ValuationPoint {
  day: Day;
  /** The player's equity value, USD. */
  valueUsd: number;
  /** Every trading competitor at that date, most valuable first: [airline id, value USD rounded to 0.1M]. (Older samples: top ten.) */
  rivals: [Id, number][];
}

/** A takeover offer a competitor has made for the player's airline. */
export interface IncomingBid {
  id: Id;
  rivalId: Id;
  rivalName: string;
  day: Day;
  expiresDay: Day;
  /** Price offered for the player's shareholders, USD. */
  priceUsd: number;
  /** The player's value when the offer was made, USD. */
  valueUsd: number;
}

/** Log of the player's own offers and acquisitions, newest last. */
export interface BidRecord {
  day: Day;
  rivalId: Id;
  rivalName: string;
  priceUsd: number;
  outcome: "accepted" | "rejected";
  /** Rejected: the board's rough asking price, rounded, as told to the player. */
  hintUsd?: number;
}

export interface MarketState {
  /** Month-end valuations, oldest first (at most 360). */
  history: ValuationPoint[];
  /** Open offers for the player's airline. */
  incoming: IncomingBid[];
  /** The player's own offers. */
  bids: BidRecord[];
  /** Competitors the player turned down: rival id -> day until which it targets the player's markets (rivals/engine.ts). */
  hostileUntil: Record<Id, Day>;
  /** Rival id -> day before which it will not consider another offer from the player. */
  cooldown: Record<Id, Day>;
  /** Paid out to the player's shareholders when the player accepted an offer for the airline, USD (a score, not cash). */
  payoutUsd: number;
  /** Airlines merged into the player, by name, with the day. */
  merged: { day: Day; name: string; viaOffer: boolean }[];
  nextBid: number;
}
