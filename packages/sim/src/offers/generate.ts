import type { AircraftType, CabinLayout, Day } from "@arg/contracts";
import { defaultLayout, layoutSeats, validateLayout } from "../fleet/layout";
import { makeRng, mixSeed } from "../rng";
import type { SimState } from "../state";
import { dayToDate, isLeapYear, START_YEAR } from "../time/calendar";
import type { Offer, OfferKind } from "./types";

/** All offer constants, documented in MODEL.md "Offers". */
export const OFFER_PARAMS = {
  /** New offers per day. 2 per 30.4-day month on average (Poisson), so most months see 1-3. */
  perDay: 2 / 30.4375,
  /** No new offers while this many are open. */
  maxOpen: 8,
  /** Relative frequency of each kind. */
  weights: { launch: 0.28, endOfLife: 0.24, distressed: 0.2, used: 0.28 } as Record<OfferKind, number>,
  /** Days before the same type may get another offer of the same kind. */
  cooldownDays: { launch: 365, endOfLife: 270, distressed: 120, used: 90 } as Record<OfferKind, number>,
  /** Launch offers appear this many years before introYear (min, max). */
  launchLeadYears: [0.75, 4] as const,
  launchDiscount: [0.15, 0.3] as const,
  launchDeposit: [0.06, 0.12] as const,
  /** First delivery is this many days after the later of introduction and the normal lead time. */
  launchExtraDays: [120, 360] as const,
  launchDelayRisk: [0.35, 0.6] as const,
  launchMaxDelayMonths: 12,
  launchExpiryDays: [60, 120] as const,
  /** End-of-life offers appear when production ends within this many years. */
  eolWindowYears: 2,
  eolDiscount: [0.1, 0.25] as const,
  eolExpiryDays: [30, 75] as const,
  distressedDiscount: [0.2, 0.4] as const,
  distressedExpiryDays: [14, 45] as const,
  distressedDelivery: [7, 45] as const,
  distressedDeposit: 0.2,
  /** Chance a distressed lot carries a non-standard cabin. */
  distressedOddCabin: 0.4,
  /** Used price / list = clamp(base * exp(-decay * age) * (1 +- noise)). */
  usedBase: 0.85,
  usedDecayPerYear: 0.075,
  usedNoise: 0.08,
  usedMinRatio: 0.08,
  usedMaxAgeYears: 22,
  usedHoursPerYear: 3000,
  usedDelivery: [14, 60] as const,
  usedExpiryDays: [20, 60] as const,
  usedDeposit: 0.15,
  /** Warn this many days before an offer lapses. */
  expiryWarnDays: 7,
} as const;

/** Names of fictional failed carriers for distressed lots. */
export const FAILED_AIRLINES = [
  "Sunrise Pacific Airways", "Meridian Air", "Coastline Jet", "Aurora Regional", "Pinnacle Skies", "Redwood Airlines", "Tradewind Air",
] as const;

const between = (rng: () => number, [lo, hi]: readonly [number, number]) => lo + rng() * (hi - lo);
const betweenInt = (rng: () => number, [lo, hi]: readonly [number, number]) => Math.round(between(rng, [lo, hi]));
const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!;

export function yearStartDay(year: number): Day {
  let d = 0;
  for (let y = START_YEAR; y < year; y++) d += isLeapYear(y) ? 366 : 365;
  return d;
}

/** Calendar year as a fraction (2017.5 is mid-2017). */
export function yearFraction(day: Day): number {
  const d = dayToDate(day);
  return d.year + d.dayOfYear / (isLeapYear(d.year) ? 366 : 365);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthYear(day: Day): string {
  const d = dayToDate(day);
  return `${MONTHS[d.month]} ${d.year}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (usd: number) => (usd >= 1e9 ? `$${(usd / 1e9).toFixed(2)}B` : `$${(usd / 1e6).toFixed(1)}M`);

/** Typical first delivery of an ordinary order of this type placed today (midpoint of the order lead-time band). */
function typicalFirst(type: AircraftType, day: Day): Day {
  const [lo, hi] = type.widebody ? [12, 30] : [6, 18];
  return Math.max(yearStartDay(type.introYear), day + Math.round(((lo + hi) / 2) * 30.4375));
}

type Builder = (rng: () => number, type: AircraftType, day: Day) => Omit<Offer, "id" | "kind" | "typeId" | "createdDay" | "expiryWarned" | "initialQuantity" | "blurb"> | null;

function launch(rng: () => number, type: AircraftType, day: Day) {
  const P = OFFER_PARAMS;
  const discount = between(rng, P.launchDiscount);
  const intro = yearStartDay(type.introYear);
  const normal = typicalFirst(type, day);
  const first = Math.max(intro, day + 180) + betweenInt(rng, P.launchExtraDays);
  const quantity = type.widebody ? betweenInt(rng, [2, 8]) : betweenInt(rng, [4, 20]);
  const unit = type.listPriceUsdM * 1e6 * (1 - discount);
  const risk = between(rng, P.launchDelayRisk);
  return {
    quantity,
    expiresDay: day + betweenInt(rng, P.launchExpiryDays),
    seller: type.manufacturer,
    listPriceUsd: type.listPriceUsdM * 1e6,
    unitPriceUsd: unit,
    discount,
    depositFraction: between(rng, P.launchDeposit),
    firstDeliveryDay: first,
    deliveryGapDays: type.widebody ? betweenInt(rng, [45, 70]) : betweenInt(rng, [25, 40]),
    typicalFirstDeliveryDay: normal,
    delayRisk: risk,
    maxDelayMonths: P.launchMaxDelayMonths,
    ageYears: null,
    flightHours: null,
    layout: null,
    layoutNote: null,
  };
}

function endOfLife(rng: () => number, type: AircraftType, day: Day) {
  const P = OFFER_PARAMS;
  const discount = between(rng, P.eolDiscount);
  const first = day + (type.widebody ? betweenInt(rng, [150, 330]) : betweenInt(rng, [90, 240]));
  const quantity = type.widebody ? betweenInt(rng, [1, 4]) : betweenInt(rng, [2, 10]);
  return {
    quantity,
    expiresDay: day + betweenInt(rng, P.eolExpiryDays),
    seller: type.manufacturer,
    listPriceUsd: type.listPriceUsdM * 1e6,
    unitPriceUsd: type.listPriceUsdM * 1e6 * (1 - discount),
    discount,
    depositFraction: 0.15,
    firstDeliveryDay: first,
    deliveryGapDays: type.widebody ? 30 : 15,
    typicalFirstDeliveryDay: typicalFirst(type, day),
    delayRisk: 0,
    maxDelayMonths: 0,
    ageYears: null,
    flightHours: null,
    layout: null,
    layoutNote: null,
  };
}

/** A non-standard cabin for a distressed lot, or null when the type has no sensible variant. */
export function oddCabin(rng: () => number, type: AircraftType): { layout: CabinLayout; note: string } | null {
  const attempts: Array<() => { layout: CabinLayout; note: string }> = [
    () => {
      const across = type.widebody ? (type.maxSeats >= 480 ? 10 : 9) : type.maxSeats >= 120 ? 6 : 4;
      return { layout: { sections: [{ cls: "Y", rows: Math.floor(type.maxSeats / across), seatsAcross: across, pitchIn: 29 }] }, note: "Single-class high-density cabin" };
    },
    () => {
      if (type.maxSeats < 120) throw new Error("no premium variant");
      const base = defaultLayout(type);
      const sections: CabinLayout["sections"] = type.widebody
        ? [{ cls: "J", rows: 10, seatsAcross: 6, pitchIn: 62 }, { cls: "W", rows: 8, seatsAcross: 7, pitchIn: 38 }]
        : [{ cls: "J", rows: 8, seatsAcross: 4, pitchIn: 38 }];
      const used = sections.reduce((s, c) => s + c.rows * c.seatsAcross, 0);
      const across = base.sections[base.sections.length - 1]!.seatsAcross;
      sections.push({ cls: "Y", rows: Math.max(1, Math.floor((type.maxSeats * 0.72 - used) / across)), seatsAcross: across, pitchIn: 32 });
      return { layout: { sections }, note: "Premium-heavy cabin built for the failed carrier's business market" };
    },
  ];
  for (const first of rng() < 0.5 ? [0, 1] : [1, 0]) {
    try {
      const v = attempts[first]!();
      if (!validateLayout(type, v.layout)) return { ...v, note: `${v.note} (${layoutSeats(v.layout)} seats)` };
    } catch { /* try the other variant */ }
  }
  return null;
}

function distressed(rng: () => number, type: AircraftType, day: Day) {
  const P = OFFER_PARAMS;
  const discount = between(rng, P.distressedDiscount);
  const quantity = type.widebody ? betweenInt(rng, [1, 3]) : betweenInt(rng, [1, 6]);
  const seller = pick(rng, FAILED_AIRLINES);
  const first = day + betweenInt(rng, P.distressedDelivery);
  const cabin = rng() < P.distressedOddCabin ? oddCabin(rng, type) : null;
  const age = Math.round(rng() * 2.5 * 10) / 10;
  return {
    quantity,
    expiresDay: day + betweenInt(rng, P.distressedExpiryDays),
    seller: `${seller} (in administration)`,
    listPriceUsd: type.listPriceUsdM * 1e6,
    unitPriceUsd: type.listPriceUsdM * 1e6 * (1 - discount),
    discount,
    depositFraction: P.distressedDeposit,
    firstDeliveryDay: first,
    deliveryGapDays: betweenInt(rng, [5, 14]),
    typicalFirstDeliveryDay: typicalFirst(type, day),
    delayRisk: 0,
    maxDelayMonths: 0,
    ageYears: age,
    flightHours: Math.round(age * P.usedHoursPerYear * (0.85 + rng() * 0.3)),
    layout: cabin?.layout ?? null,
    layoutNote: cabin?.note ?? null,
  };
}

function usedAircraft(rng: () => number, type: AircraftType, day: Day) {
  const P = OFFER_PARAMS;
  const maxAge = Math.min(P.usedMaxAgeYears, yearFraction(day) - type.introYear + 1);
  if (maxAge < 2) return null;
  const age = Math.round((2 + rng() * (maxAge - 2)) * 10) / 10;
  const ratio = Math.min(0.8, Math.max(P.usedMinRatio, P.usedBase * Math.exp(-P.usedDecayPerYear * age) * (1 + (rng() * 2 - 1) * P.usedNoise)));
  const quantity = rng() < 0.75 ? 1 : betweenInt(rng, [2, 3]);
  const hours = Math.round(age * P.usedHoursPerYear * (0.85 + rng() * 0.3));
  const first = day + betweenInt(rng, P.usedDelivery);
  const seller = pick(rng, ["a European lessor", "a Pacific lessor", "a Midwest regional carrier", "a broker in Dublin", "a Gulf lessor"] as const);
  return {
    quantity,
    expiresDay: day + betweenInt(rng, P.usedExpiryDays),
    seller: seller.charAt(0).toUpperCase() + seller.slice(1),
    listPriceUsd: type.listPriceUsdM * 1e6,
    unitPriceUsd: type.listPriceUsdM * 1e6 * ratio,
    discount: 1 - ratio,
    depositFraction: P.usedDeposit,
    firstDeliveryDay: first,
    deliveryGapDays: 21,
    typicalFirstDeliveryDay: typicalFirst(type, day),
    delayRisk: 0,
    maxDelayMonths: 0,
    ageYears: age,
    flightHours: hours,
    layout: null,
    layoutNote: null,
  };
}

/** The "why this offer" text, composed from the final terms. */
export function blurbFor(kind: OfferKind, o: Omit<Offer, "blurb" | "id" | "typeId" | "kind" | "createdDay" | "expiryWarned" | "initialQuantity">, type: AircraftType): string {
  const n = o.quantity;
  switch (kind) {
    case "launch":
      return (
        `${type.manufacturer} is looking for launch customers for the ${type.name}, entering service in ${type.introYear}. ` +
        `Commit now for ${pct(o.discount)} off list and only a ${pct(o.depositFraction)} deposit. ` +
        `The catch: your first aircraft arrives about ${monthYear(o.firstDeliveryDay)} (a normal order would see ${monthYear(o.typicalFirstDeliveryDay)}), ` +
        `and new types often slip, by up to ${o.maxDelayMonths} months (${pct(o.delayRisk)} chance).`
      );
    case "endOfLife":
      return (
        `${type.manufacturer} is closing the ${type.name} line (last deliveries ${type.endYear}). ` +
        `${n} production slots are still unsold, so they are offered at ${pct(o.discount)} off list with delivery from ${monthYear(o.firstDeliveryDay)}, ` +
        `well ahead of the usual lead time. Once the slots are gone the type can no longer be ordered new.`
      );
    case "distressed": {
      const who = o.seller.replace(" (in administration)", "");
      return (
        `${who} has ceased operations and its administrators are selling ${n} aircraft that are already built, ` +
        `${(o.ageYears ?? 0) < 0.5 ? "barely flown" : `about ${(o.ageYears ?? 0).toFixed(1)} years old`}, at ${pct(o.discount)} below list. ` +
        `First come, first served: delivery in weeks, and the lot closes on ${monthYear(o.expiresDay)}.` +
        (o.layoutNote ? ` ${o.layoutNote}.` : "")
      );
    }
    case "used":
      return (
        `${o.seller} is listing ${n === 1 ? "a" : n} used ${type.name}${n > 1 ? "s" : ""}, ` +
        `${(o.ageYears ?? 0).toFixed(1)} years old with about ${(o.flightHours ?? 0).toLocaleString("en-US")} flight hours. ` +
        `Priced at ${pct(1 - o.discount)} of a new aircraft, available in a few weeks.`
      );
  }
}

const BUILDERS: Record<OfferKind, Builder> = { launch, endOfLife, distressed, used: usedAircraft } as Record<OfferKind, Builder>;

function eligible(kind: OfferKind, t: AircraftType, day: Day, state: SimState): boolean {
  const yf = yearFraction(day);
  const year = dayToDate(day).year;
  const last = state.offerLog[`${kind}:${t.id}`];
  if (last !== undefined && day - last < OFFER_PARAMS.cooldownDays[kind]) return false;
  if (state.offers.some((o) => o.typeId === t.id && o.kind === kind)) return false;
  switch (kind) {
    case "launch": {
      const lead = t.introYear - yf;
      return lead >= OFFER_PARAMS.launchLeadYears[0] && lead <= OFFER_PARAMS.launchLeadYears[1];
    }
    case "endOfLife":
      return t.introYear <= yf && t.endYear !== null && t.endYear >= year && t.endYear <= year + OFFER_PARAMS.eolWindowYears;
    case "distressed":
      return t.introYear <= yf && (t.endYear === null || t.endYear >= year - 4);
    case "used":
      return t.introYear <= yf - 1;
  }
}

/** Possibly create one offer for `day`. Pure: draws only from a stream seeded by (world seed, day). */
export function generateOffer(state: SimState, day: Day): Offer | null {
  const P = OFFER_PARAMS;
  if (state.offers.length >= P.maxOpen) return null;
  const rng = makeRng(mixSeed(state.world.seed, day * 8 + 0x0ffe));
  if (rng() >= P.perDay) return null;
  // Pick a kind by weight among kinds that have at least one eligible type.
  const kinds = (Object.keys(P.weights) as OfferKind[]).filter((k) => state.aircraftTypes.some((t) => eligible(k, t, day, state)));
  if (kinds.length === 0) return null;
  let r = rng() * kinds.reduce((s, k) => s + P.weights[k], 0);
  let kind = kinds[kinds.length - 1]!;
  for (const k of kinds) { r -= P.weights[k]; if (r <= 0) { kind = k; break; } }
  const types = state.aircraftTypes.filter((t) => eligible(kind, t, day, state));
  const type = pick(rng, types);
  const body = BUILDERS[kind](rng, type, day);
  if (!body) return null;
  const blurb = blurbFor(kind, body, type);
  return { ...body, blurb, id: `offer-${day}`, kind, typeId: type.id, createdDay: day, initialQuantity: body.quantity, expiryWarned: false };
}

export const KIND_LABEL: Record<OfferKind, string> = {
  launch: "Launch customer", endOfLife: "End of line", distressed: "Flash sale", used: "Used market",
};

export function describeOffer(o: Offer, type: AircraftType | undefined): string {
  const name = type?.id ?? o.typeId;
  return `${KIND_LABEL[o.kind]}: ${o.quantity} x ${name} at ${money(o.unitPriceUsd)} each (${pct(o.discount)} below list).`;
}
