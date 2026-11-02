import type { CabinLayout, Day, Id } from "@arg/contracts";

/** launch = new type about to enter service; endOfLife = last production slots; distressed = flash-sale lot; used = secondary market. */
export type OfferKind = "launch" | "endOfLife" | "distressed" | "used";

/** A manufacturer or seller proposal sitting in `SimState.offers` until accepted, dismissed or expired. */
export interface Offer {
  id: Id;
  kind: OfferKind;
  typeId: Id;
  /** Aircraft still available (accepting a part leaves the rest open). */
  quantity: number;
  initialQuantity: number;
  createdDay: Day;
  expiresDay: Day;
  /** Who is selling: the manufacturer, a failed airline's administrators, or a lessor/broker. */
  seller: string;
  /** List price of a new aircraft of this type, USD. */
  listPriceUsd: number;
  /** Price per aircraft under the offer, USD. */
  unitPriceUsd: number;
  /** 1 - unit / list. For used aircraft this is the age discount. */
  discount: number;
  /** Deposit as a fraction of net price, paid at acceptance and credited back at delivery. */
  depositFraction: number;
  firstDeliveryDay: Day;
  /** Days between successive aircraft. */
  deliveryGapDays: number;
  /** What a normal order of this type would get as its first delivery (for the "later than typical" comparison). */
  typicalFirstDeliveryDay: Day;
  /** Probability the delivery slips (launch offers only), and the longest slip in months. */
  delayRisk: number;
  maxDelayMonths: number;
  ageYears: number | null;
  flightHours: number | null;
  /** Cabin on offer; null means the type's default layout. */
  layout: CabinLayout | null;
  layoutNote: string | null;
  /** "Why this offer" text for the UI. */
  blurb: string;
  expiryWarned: boolean;
}

export type OfferCommand =
  | { kind: "acceptOffer"; offerId: Id; quantity: number }
  | { kind: "dismissOffer"; offerId: Id };
