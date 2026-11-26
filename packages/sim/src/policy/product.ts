// Airline product policies (owner request, 26 Nov 2026): onboard service and ancillary fees by distance band, like the fare policy
// categories. They change four things on every player route:
//   1. the passenger-services cost per passenger (meals, amenities, crew staffing on the crew line),
//   2. the ancillary revenue per passenger (bags, seats, priority, changes, buy-on-board sales),
//   3. the fare passengers compare: fees they expect to pay are partly added to the headline fare in the choice model,
//   4. the itinerary's quality in the choice model: service above or below what passengers expect for the distance, plus the
//      airline's reputation, which follows satisfaction slowly (weeks to months).
// Against competitors: quality is compared with the other itineraries in the market by the choice model itself, and service far
// above the best competitor in a market earns little extra share (see `saturateQuality`), so over-serving costs money for little gain.
//
// Calibration: the default policy of each band reproduces the ledger's flat figures exactly (USD 13 services, USD 14 ancillary per
// passenger, quality and perceived fare unchanged), so a player who never opens the panel plays the game as calibrated before.
// Every figure below is a game-design estimate, not sourced data.
import type { Airport, Day } from "@arg/contracts";
import { distanceKm } from "../geo";
import { DISTANCE_BANDS } from "../route/farePolicy";

export type Band = "short" | "medium" | "long" | "ultra";
export const BANDS: readonly Band[] = ["short", "medium", "long", "ultra"];
export const BAND_LABEL: Record<Band, string> = { short: "Short haul", medium: "Medium haul", long: "Long haul", ultra: "Ultra-long haul" };
export const BAND_RANGE: Record<Band, string> = {
  short: `under ${DISTANCE_BANDS.shortBelowKm.toLocaleString("en-US")} km`,
  medium: `${DISTANCE_BANDS.shortBelowKm.toLocaleString("en-US")} to ${DISTANCE_BANDS.mediumBelowKm.toLocaleString("en-US")} km`,
  long: `${DISTANCE_BANDS.mediumBelowKm.toLocaleString("en-US")} to ${DISTANCE_BANDS.longBelowKm.toLocaleString("en-US")} km`,
  ultra: `over ${DISTANCE_BANDS.longBelowKm.toLocaleString("en-US")} km`,
};

export function bandOf(km: number): Band {
  return km < DISTANCE_BANDS.shortBelowKm ? "short" : km < DISTANCE_BANDS.mediumBelowKm ? "medium" : km <= DISTANCE_BANDS.longBelowKm ? "long" : "ultra";
}
export const bandOfPair = (a: Airport, b: Airport): Band => bandOf(distanceKm(a, b));

export type MealLevel = "none" | "buy" | "snack" | "meal" | "premium";
export type CrewLevel = "lean" | "standard" | "generous";
export type AmenityLevel = "basic" | "standard" | "premium";
export const MEAL_LEVELS: readonly MealLevel[] = ["none", "buy", "snack", "meal", "premium"];
export const CREW_LEVELS: readonly CrewLevel[] = ["lean", "standard", "generous"];
export const AMENITY_LEVELS: readonly AmenityLevel[] = ["basic", "standard", "premium"];
export const MEAL_LABEL: Record<MealLevel, string> = { none: "Nothing", buy: "Buy on board", snack: "Free snack", meal: "Hot meal", premium: "Premium dining" };
export const CREW_LABEL: Record<CrewLevel, string> = { lean: "Lean (−1 attendant)", standard: "Standard", generous: "Generous (+1 attendant)" };
export const AMENITY_LABEL: Record<AmenityLevel, string> = { basic: "Basic", standard: "Wi-Fi, streaming", premium: "Screens and kits" };

export interface ServicePolicy { meal: MealLevel; crew: CrewLevel; amenities: AmenityLevel }
/** Fees per one-way passenger, USD. 0 = included in the fare. */
export interface AncillaryPolicy { bagFee: number; seatFee: number; priorityFee: number; changeFee: number }
export const ANCILLARY_KEYS: readonly (keyof AncillaryPolicy)[] = ["bagFee", "seatFee", "priorityFee", "changeFee"];
export const ANCILLARY_LABEL: Record<keyof AncillaryPolicy, string> = { bagFee: "Checked bag", seatFee: "Seat selection", priorityFee: "Priority boarding", changeFee: "Ticket change" };
export const FEE_MAX: Record<keyof AncillaryPolicy, number> = { bagFee: 150, seatFee: 100, priorityFee: 80, changeFee: 400 };

export interface ProductPolicy {
  service: Record<Band, ServicePolicy>;
  ancillary: Record<Band, AncillaryPolicy>;
}

/** Airline-wide product state: the policy and the reputation it has earned. Stored in SimState.product (absent = defaults). */
export interface ProductState {
  policy: ProductPolicy;
  /** Brand reputation, -1 (awful) to +1 (excellent); 0 = as expected. Moves toward the weekly satisfaction slowly. */
  reputation: number;
  /** Last weekly satisfaction target (same scale), for the UI trend. */
  satisfaction: number;
  /** Weekly reputation samples, newest last (at most 104). */
  history: { day: Day; reputation: number }[];
}

export const DEFAULT_POLICY: ProductPolicy = {
  service: {
    short: { meal: "snack", crew: "standard", amenities: "basic" },
    medium: { meal: "snack", crew: "standard", amenities: "standard" },
    long: { meal: "meal", crew: "standard", amenities: "standard" },
    ultra: { meal: "meal", crew: "standard", amenities: "premium" },
  },
  ancillary: {
    short: { bagFee: 30, seatFee: 10, priorityFee: 10, changeFee: 75 },
    medium: { bagFee: 35, seatFee: 15, priorityFee: 15, changeFee: 100 },
    long: { bagFee: 0, seatFee: 30, priorityFee: 20, changeFee: 200 },
    ultra: { bagFee: 0, seatFee: 40, priorityFee: 25, changeFee: 250 },
  },
};

/** Cheapest product a passenger tolerates and the full-service one: one-click presets for the panel. */
export const PRESETS: Record<"lowcost" | "standard" | "full", ProductPolicy> = {
  lowcost: {
    service: Object.fromEntries(BANDS.map((b) => [b, { meal: "buy", crew: "lean", amenities: "basic" }])) as Record<Band, ServicePolicy>,
    ancillary: {
      short: { bagFee: 45, seatFee: 20, priorityFee: 15, changeFee: 100 },
      medium: { bagFee: 50, seatFee: 25, priorityFee: 20, changeFee: 125 },
      long: { bagFee: 60, seatFee: 40, priorityFee: 25, changeFee: 200 },
      ultra: { bagFee: 70, seatFee: 50, priorityFee: 30, changeFee: 250 },
    },
  },
  standard: DEFAULT_POLICY,
  full: {
    service: {
      short: { meal: "snack", crew: "generous", amenities: "standard" },
      medium: { meal: "meal", crew: "generous", amenities: "standard" },
      long: { meal: "premium", crew: "generous", amenities: "premium" },
      ultra: { meal: "premium", crew: "generous", amenities: "premium" },
    },
    ancillary: {
      short: { bagFee: 0, seatFee: 0, priorityFee: 0, changeFee: 0 },
      medium: { bagFee: 0, seatFee: 0, priorityFee: 0, changeFee: 50 },
      long: { bagFee: 0, seatFee: 0, priorityFee: 0, changeFee: 100 },
      ultra: { bagFee: 0, seatFee: 0, priorityFee: 0, changeFee: 100 },
    },
  },
};

export const PRODUCT_PARAMS = {
  /** Service points: what each level is worth to a passenger. Passengers expect the default policy's points for the distance. */
  mealPoints: { none: 0, buy: 1, snack: 2, meal: 3, premium: 4.5 } as Record<MealLevel, number>,
  crewPoints: { lean: 0, standard: 1, generous: 1.8 } as Record<CrewLevel, number>,
  amenityPoints: { basic: 0, standard: 1, premium: 2 } as Record<AmenityLevel, number>,
  /** Raw cost per passenger, USD: meals by band, amenities by band, and the rest of passenger services (check-in, claims). */
  mealCost: {
    none: { short: 0, medium: 0, long: 0, ultra: 0 },
    buy: { short: 1, medium: 1.5, long: 2, ultra: 2.5 },
    snack: { short: 2.5, medium: 3.5, long: 5, ultra: 6 },
    meal: { short: 9, medium: 13, long: 22, ultra: 30 },
    premium: { short: 18, medium: 26, long: 45, ultra: 60 },
  } as Record<MealLevel, Record<Band, number>>,
  amenityCost: {
    basic: { short: 0, medium: 0, long: 0, ultra: 0 },
    standard: { short: 1.5, medium: 3, long: 5, ultra: 7 },
    premium: { short: 4, medium: 7, long: 13, ultra: 18 },
  } as Record<AmenityLevel, Record<Band, number>>,
  otherServicesCost: 9,
  /** Flight attendants added per flight by the crew level (the ledger keeps at least two). */
  crewDelta: { lean: -1, standard: 0, generous: 1 } as Record<CrewLevel, number>,
  /** Buy-on-board sales per passenger, USD (meal "buy" only). */
  buyOnBoardUsd: { short: 3, medium: 5, long: 7, ultra: 8 } as Record<Band, number>,
  /**
   * Fees: share of passengers who would use each extra if it were free (`need`), and how fast take-up falls with the fee
   * (take = need x exp(-fee / scale)). Revenue per passenger = fee x take. Passengers who need it see `perception` of the fee as part
   * of the price when they compare airlines.
   */
  fee: {
    bagFee: { need: { short: 0.5, medium: 0.55, long: 0.7, ultra: 0.75 } as Record<Band, number>, scale: 55 },
    seatFee: { need: { short: 0.3, medium: 0.35, long: 0.45, ultra: 0.5 } as Record<Band, number>, scale: 30 },
    priorityFee: { need: { short: 0.15, medium: 0.15, long: 0.15, ultra: 0.15 } as Record<Band, number>, scale: 25 },
    changeFee: { need: { short: 0.06, medium: 0.06, long: 0.07, ultra: 0.07 } as Record<Band, number>, scale: 300 },
  },
  perception: 0.6,
  /** Quality per service point above or below expectation (choice-model quality is 0..1 around 0.5). Points above the first count half. */
  qualityPerPoint: 0.035,
  qualityExcessFactor: 0.5,
  /** Quality per unit of reputation (-1..1). */
  qualityPerReputation: 0.06,
  /** Above the best competitor in the market by more than `saturationGap`, extra quality counts only `saturationFactor`. */
  saturationGap: 0.04,
  saturationFactor: 0.25,
  /** Satisfaction (weekly target of reputation): per service point vs expectation, and per USD of fees above the default ones. */
  satisfactionPerPoint: 0.15,
  satisfactionPerFeeUsd: 1 / 60,
  /** Reputation moves this fraction of the way to satisfaction each week (about a half-life of 4 months). */
  reputationStep: 1 / 26,
} as const;

const servicePoints = (s: ServicePolicy) => PRODUCT_PARAMS.mealPoints[s.meal] + PRODUCT_PARAMS.crewPoints[s.crew] + PRODUCT_PARAMS.amenityPoints[s.amenities];
const rawServiceCost = (s: ServicePolicy, b: Band) => PRODUCT_PARAMS.mealCost[s.meal][b] + PRODUCT_PARAMS.amenityCost[s.amenities][b] + PRODUCT_PARAMS.otherServicesCost;
const take = (k: keyof AncillaryPolicy, fee: number, b: Band) => PRODUCT_PARAMS.fee[k].need[b] * Math.exp(-Math.max(0, fee) / PRODUCT_PARAMS.fee[k].scale);
const rawAncillary = (s: ServicePolicy, f: AncillaryPolicy, b: Band) =>
  ANCILLARY_KEYS.reduce((t, k) => t + f[k] * take(k, f[k], b), 0) + (s.meal === "buy" ? PRODUCT_PARAMS.buyOnBoardUsd[b] : 0);
/** Fees a passenger expects to pay for what they need, USD (before `perception`). */
const expectedFees = (f: AncillaryPolicy, b: Band) => ANCILLARY_KEYS.reduce((t, k) => t + PRODUCT_PARAMS.fee[k].need[b] * Math.max(0, f[k]), 0);

/** Ledger figures the services and ancillary lines are calibrated to (finance/ledger.ts LEDGER_PARAMS). */
export const LEDGER_SERVICES_USD = 13;
export const LEDGER_ANCILLARY_USD = 14;

/** What a band's policy does to a route of that band. */
export interface ProductEffect {
  band: Band;
  /** Passenger-services cost per passenger, USD (replaces the ledger's flat figure). */
  servicesUsdPerPax: number;
  /** Ancillary revenue per passenger, USD (replaces the ledger's flat figure). */
  ancillaryUsdPerPax: number;
  /** Flight attendants added per flight (negative = fewer). */
  crewDelta: number;
  /** Added to the player's quality in the choice model (before saturation against competitors). */
  qualityDelta: number;
  /** Added to the fare passengers compare, USD (fees above the default ones; negative when cheaper). */
  perceivedFareUsd: number;
  /** Service points minus what passengers expect for the distance. */
  pointsVsExpected: number;
  /** Expected fees minus the default policy's, USD. */
  feesVsDefault: number;
}

export function productEffect(policy: ProductPolicy, band: Band, reputation = 0): ProductEffect {
  const P = PRODUCT_PARAMS;
  const s = policy.service[band], f = policy.ancillary[band];
  const ds = DEFAULT_POLICY.service[band], df = DEFAULT_POLICY.ancillary[band];
  const gap = servicePoints(s) - servicePoints(ds);
  const shaped = gap <= 1 ? gap : 1 + (gap - 1) * P.qualityExcessFactor;
  const feesVsDefault = expectedFees(f, band) - expectedFees(df, band);
  return {
    band,
    servicesUsdPerPax: LEDGER_SERVICES_USD * rawServiceCost(s, band) / rawServiceCost(ds, band),
    ancillaryUsdPerPax: LEDGER_ANCILLARY_USD * rawAncillary(s, f, band) / rawAncillary(ds, df, band),
    crewDelta: P.crewDelta[s.crew],
    qualityDelta: P.qualityPerPoint * shaped + P.qualityPerReputation * reputation,
    perceivedFareUsd: P.perception * feesVsDefault,
    pointsVsExpected: gap,
    feesVsDefault,
  };
}

/** Player quality after saturation: far above the best competitor in the market, extra quality wins little more share. */
export function saturateQuality(quality: number, bestCompetitor: number | null): number {
  if (bestCompetitor === null) return quality;
  const cap = bestCompetitor + PRODUCT_PARAMS.saturationGap;
  return quality <= cap ? quality : cap + (quality - cap) * PRODUCT_PARAMS.saturationFactor;
}

export const defaultProduct = (): ProductState => ({ policy: structuredClone(DEFAULT_POLICY), reputation: 0, satisfaction: 0, history: [] });
export const productOf = (s: { product?: ProductState }): ProductState => s.product ?? defaultProduct();

/** Weekly satisfaction from the passengers carried per band: service versus expectation, and fees versus the default. In -1..1. */
export function satisfactionOf(policy: ProductPolicy, paxByBand: Partial<Record<Band, number>>): number {
  let w = 0, t = 0;
  for (const b of BANDS) {
    const pax = paxByBand[b] ?? 0;
    if (pax <= 0) continue;
    const e = productEffect(policy, b);
    t += pax * (PRODUCT_PARAMS.satisfactionPerPoint * e.pointsVsExpected - PRODUCT_PARAMS.satisfactionPerFeeUsd * Math.max(0, e.feesVsDefault));
    w += pax;
  }
  return w > 0 ? Math.max(-1, Math.min(1, t / w)) : 0;
}

/** One week of reputation: a step toward satisfaction. */
export function stepReputation(p: ProductState, satisfaction: number, day: Day): ProductState {
  const reputation = Math.max(-1, Math.min(1, p.reputation + (satisfaction - p.reputation) * PRODUCT_PARAMS.reputationStep));
  return { ...p, reputation, satisfaction, history: [...p.history, { day, reputation }].slice(-104) };
}

/** Problems with a policy (commands refuse it), or null. */
export function policyError(p: unknown): string | null {
  const o = p as ProductPolicy;
  if (!o || typeof o !== "object" || !o.service || !o.ancillary) return "The policy is incomplete.";
  for (const b of BANDS) {
    const s = o.service[b], f = o.ancillary[b];
    if (!s || !MEAL_LEVELS.includes(s.meal) || !CREW_LEVELS.includes(s.crew) || !AMENITY_LEVELS.includes(s.amenities)) return `The ${BAND_LABEL[b].toLowerCase()} service is invalid.`;
    if (!f) return `The ${BAND_LABEL[b].toLowerCase()} fees are missing.`;
    for (const k of ANCILLARY_KEYS) {
      const v = f[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > FEE_MAX[k]) return `${ANCILLARY_LABEL[k]} fee (${BAND_LABEL[b].toLowerCase()}) must be from $0 to $${FEE_MAX[k]}.`;
    }
  }
  return null;
}
