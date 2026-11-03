import type { Airport, Day } from "@arg/contracts";
import { isLandPair } from "@arg/data";
import { fractionalYear } from "../time/calendar";

/**
 * Region-generic economics (MODEL.md section 12). Everything that used to special-case CA/HI/OR/WA is derived from an airport's
 * `country`, `region` (state) and `landmass`. Every number here is an ESTIMATE unless a comment says otherwise; the US West Coast
 * (CA, OR, WA, NV, AZ, ...) is the calibration base and has multiplier exactly 1, Hawaii keeps its additive fuel premium, so the
 * pre-expansion calibration is numerically unchanged.
 */

// ---------------------------------------------------------------------------
// Geography classes
// ---------------------------------------------------------------------------

export const isUs = (a: Airport) => a.country === "US";
/** Europe = every non-US airport in the data (the data package covers only the US and Europe). */
export const isEurope = (a: Airport) => a.country !== "US";

/** Countries inside the EU emissions trading system (EU/EEA) plus the UK and Switzerland, which run linked or equivalent schemes. */
const ETS_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
  "RO", "SK", "SI", "ES", "SE", "IS", "NO", "GB", "CH",
]);

// ---------------------------------------------------------------------------
// Fuel
// ---------------------------------------------------------------------------

/**
 * Jet fuel price multiplier on the West Coast base series (`JET_A_ANCHORS`), by US state. ESTIMATES informed by the usual EIA PADD
 * spreads of the 2015-2019 period (Gulf Coast the cheapest, the West Coast the dearest by roughly 10-15%); they are not a data set.
 * States not listed use 1.0 (West Coast and Pacific Northwest, Nevada, Arizona, Idaho, Utah, and anything unknown).
 */
export const US_FUEL_MULTIPLIER_BY_STATE: Readonly<Record<string, number>> = {
  // Gulf Coast refining
  TX: 0.9, LA: 0.9, MS: 0.9, AL: 0.9, AR: 0.9, OK: 0.9,
  // Southeast
  GA: 0.94, FL: 0.94, SC: 0.94, NC: 0.94, TN: 0.94, KY: 0.94, VA: 0.94, WV: 0.94,
  // Midwest
  IL: 0.95, IN: 0.95, OH: 0.95, MI: 0.95, WI: 0.95, MN: 0.95, IA: 0.95, MO: 0.95, KS: 0.95, NE: 0.95, SD: 0.95, ND: 0.95,
  // Rocky Mountain
  CO: 0.97, WY: 0.97, MT: 0.97, NM: 0.97,
  // Northeast and Mid-Atlantic (imports and pipeline)
  NY: 0.97, NJ: 0.97, PA: 0.97, CT: 0.97, RI: 0.97, MA: 0.97, NH: 0.97, VT: 0.97, ME: 0.97, MD: 0.97, DC: 0.97, DE: 0.97,
};

/** Extra USD/gal at remote or island US airports. Hawaii is the original value (shipped-in fuel); Alaska is an ESTIMATE of the same order. */
export const US_FUEL_ADD_BY_STATE: Readonly<Record<string, number>> = { HI: 0.35, AK: 0.35 };

/**
 * Europe: product price vs the US West Coast base, ESTIMATE. NWE jet in 2015-2019 sat below the West Coast series (it excludes the
 * West Coast premium) but into-plane fees are higher, so 0.97 is used; Nordic, Swiss and island airports are dearer. Fuel is untaxed
 * for commercial aviation in the EU (Chicago Convention / Energy Taxation Directive), so no duty is added.
 */
export const EUROPE_FUEL_MULTIPLIER = 0.97;
export const EUROPE_FUEL_MULTIPLIER_BY_COUNTRY: Readonly<Record<string, number>> = {
  NO: 1.06, IS: 1.1, CH: 1.06, SE: 1.03, FI: 1.03, JE: 1.05, GG: 1.05, IM: 1.05, MT: 1.03, CY: 1.03,
};
/** Anchors (calendar year, USD/gal) of the carbon cost net of free allowances for flights departing ETS countries. ESTIMATE: EUA price x 9.6 kg CO2/gal x unfunded share (free allocation covered most emissions until the 2024-26 phase-out). */
export const ETS_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2015, 0.01], [2018, 0.03], [2019, 0.05], [2021, 0.08], [2022, 0.13], [2023, 0.14], [2024, 0.2], [2026, 0.27],
];

function etsUsdPerGallon(day: Day): number {
  const y = fractionalYear(day);
  const a = ETS_ANCHORS;
  if (y <= a[0]![0]) return a[0]![1];
  for (let i = 1; i < a.length; i++) {
    const [y1, p1] = a[i]!;
    if (y <= y1) {
      const [y0, p0] = a[i - 1]!;
      return p0 + ((p1 - p0) * (y - y0)) / (y1 - y0);
    }
  }
  return a[a.length - 1]![1];
}

/** Region of an airport for fuel purposes: a state code ("CA", "HI") or a country code. Accepts an airport or just the `region` string. */
export type FuelPlace = Airport | string;

/** `base` price (West Coast series, USD/gal) turned into the price at `place` on `day`. For CA/HI strings this is exactly `base` / `base + 0.35`. */
export function localFuelPrice(base: number, day: Day, place: FuelPlace): number {
  if (typeof place === "string") return base * (US_FUEL_MULTIPLIER_BY_STATE[place] ?? 1) + (US_FUEL_ADD_BY_STATE[place] ?? 0);
  if (place.country === "US") return base * (US_FUEL_MULTIPLIER_BY_STATE[place.region] ?? 1) + (US_FUEL_ADD_BY_STATE[place.region] ?? 0);
  const mult = EUROPE_FUEL_MULTIPLIER_BY_COUNTRY[place.country] ?? EUROPE_FUEL_MULTIPLIER;
  return base * mult + (ETS_COUNTRIES.has(place.country) ? etsUsdPerGallon(day) : 0);
}

// ---------------------------------------------------------------------------
// Operating-cost multipliers
// ---------------------------------------------------------------------------

/** Landing, passenger and security charges, Europe vs the US calibration (1.0). ESTIMATE: European airport charges are commonly 1.3-1.6x US per departure. */
export const EUROPE_AIRPORT_FEE_MULTIPLIER = 1.3;
/** Ground handling, Europe vs US. ESTIMATE (regulated third-party handling, higher labour on the ramp). */
export const EUROPE_HANDLING_MULTIPLIER = 1.15;
/** Alaska and Hawaii station costs are left at the US value (no data to say otherwise). */
/**
 * Flight and cabin crew cost multiplier vs the US pay scale in the ledger (pilot 340 USD/h, FA 85 USD/h). ESTIMATE in four wage tiers,
 * not country data: the order of the tiers (Switzerland/Nordics/Germany highest, Eastern Europe lowest) is well known, the factors are guesses.
 */
export const LABOUR_TIERS: Readonly<Record<string, number>> = { high: 1.0, midHigh: 0.9, mid: 0.75, low: 0.5 };
export const EUROPE_LABOUR_TIER_BY_COUNTRY: Readonly<Record<string, keyof typeof LABOUR_TIERS>> = {
  CH: "high", NO: "high", DK: "high", SE: "high", DE: "high", IS: "high", LU: "high",
  GB: "midHigh", FR: "midHigh", NL: "midHigh", BE: "midHigh", AT: "midHigh", FI: "midHigh", IE: "midHigh", JE: "midHigh", GG: "midHigh", IM: "midHigh",
  IT: "mid", ES: "mid", GR: "mid", PT: "mid", CY: "mid", MT: "mid", SI: "mid", CZ: "mid", EE: "mid",
  PL: "low", HU: "low", SK: "low", RO: "low", BG: "low", HR: "low", LV: "low", LT: "low", RS: "low", BA: "low", ME: "low", MK: "low", AL: "low", XK: "low",
};

export interface CostFactors {
  airport: number;
  handling: number;
  labour: number;
}

const US_FACTORS: CostFactors = { airport: 1, handling: 1, labour: 1 };

function costOf(a: Airport): CostFactors {
  if (a.country === "US") return US_FACTORS;
  return {
    airport: EUROPE_AIRPORT_FEE_MULTIPLIER,
    handling: EUROPE_HANDLING_MULTIPLIER,
    labour: LABOUR_TIERS[EUROPE_LABOUR_TIER_BY_COUNTRY[a.country] ?? "mid"]!,
  };
}

/** Landing and handling are paid at both ends of a round trip, crew are paid by the operator's base: all three are the mean of the two airports. */
export function costFactors(a: Airport, b: Airport): CostFactors {
  const x = costOf(a), y = costOf(b);
  if (x === y) return x;
  return { airport: (x.airport + y.airport) / 2, handling: (x.handling + y.handling) / 2, labour: (x.labour + y.labour) / 2 };
}

// ---------------------------------------------------------------------------
// Fare level
// ---------------------------------------------------------------------------

/**
 * `benchmarkFare(d)` is calibrated on US (California) fares. Fare level scales it per market: 1 for US airports; for a European
 * airport `EUROPE_FARE_BASE x clamp((gdp / EUROPE_FARE_GDP_REF)^EUROPE_FARE_INCOME_EXP)`, ESTIMATES: intra-European average
 * fares are lower than US ones at equal distance (big LCC share, 2015 average intra-EU one-way fare around EUR 80-100 for ~1,000 km,
 * which is 0.7-0.8 of the benchmark), and richer countries pay more. A pair uses the mean of its two ends, so US-Europe is about 0.9.
 */
export const EUROPE_FARE_BASE = 0.8;
export const EUROPE_FARE_GDP_REF = 40_000;
export const EUROPE_FARE_INCOME_EXP = 0.3;
export const EUROPE_FARE_RANGE = [0.7, 1.25] as const;

function fareLevelOf(a: Airport): number {
  if (a.country === "US") return 1;
  const g = (a.gdpPerCapita / EUROPE_FARE_GDP_REF) ** EUROPE_FARE_INCOME_EXP;
  return EUROPE_FARE_BASE * Math.min(EUROPE_FARE_RANGE[1] / EUROPE_FARE_BASE, Math.max(EUROPE_FARE_RANGE[0] / EUROPE_FARE_BASE, g));
}

export function fareLevel(a: Airport, b: Airport): number {
  if (a.country === "US" && b.country === "US") return 1;
  return (fareLevelOf(a) + fareLevelOf(b)) / 2;
}

// ---------------------------------------------------------------------------
// Surface alternatives (drive, high-speed rail)
// ---------------------------------------------------------------------------

export interface SurfaceAlternative {
  /** A road trip is practical (same landmass, or UK-continent through the Channel Tunnel). Alaska is roadless: always false there. */
  drive: boolean;
  /** 0..1 availability/quality of passenger rail (high-speed rail corridors); 0 = none. */
  rail: number;
  /** Short-haul demand damping distance (km) for the gravity model, used when `drive`. */
  groundKm: number;
}

/** US ground damping distance (calibrated, MODEL.md section 1) and the stronger European one. */
export const US_GROUND_KM = 150;
export const EUROPE_GROUND_KM = 220;

/**
 * Rail quality by country (ESTIMATE): share of the best-case rail attractiveness a pair gets. France, Spain, Italy, Benelux have dense
 * high-speed networks; Germany's ICE is slower on many city pairs in 2015; others are conventional or partial. A cross-border pair gets
 * the lower of its two countries.
 */
export const RAIL_QUALITY_BY_COUNTRY: Readonly<Record<string, number>> = {
  FR: 1, ES: 1, IT: 0.9, NL: 0.9, BE: 0.9, DE: 0.7, LU: 0.7, CH: 0.8, AT: 0.7, SE: 0.6, DK: 0.6, GB: 0.6, PT: 0.4, FI: 0.4, NO: 0.4, PL: 0.4, CZ: 0.4,
};
export const RAIL_QUALITY_DEFAULT = 0.3;
/** Eurostar: London to Paris and Brussels (Amsterdam's direct service only began in 2018, not modelled). */
const CHANNEL_RAIL_COUNTRIES = new Set(["FR", "BE"]);
/** US Northeast Corridor (Acela and regional rail) airports, and the quality given to pairs among them. ESTIMATE. */
export const US_NORTHEAST_CORRIDOR = new Set(["BOS", "PVD", "JFK", "LGA", "EWR", "PHL", "BWI", "DCA", "HPN", "ISP"]);
export const US_NEC_RAIL_QUALITY = 0.6;

const channelLink = (a: Airport, b: Airport) =>
  (a.landmass === "GB" && b.landmass === "EU-MAINLAND") || (b.landmass === "GB" && a.landmass === "EU-MAINLAND");

/**
 * Surface alternative between two airports. Pure geography (no distance): the choice model and the gravity damping apply distance.
 * Land pairs by landmass tag; Alaska pairs have none (a single landmass but nearly roadless; the Anchorage-Fairbanks road and the
 * Juneau case are ignored on purpose); Hawaii, other islands and CONUS-Alaska/Hawaii have none (overwater).
 */
export function surfaceAlternative(a: Airport, b: Airport): SurfaceAlternative {
  const land = isLandPair(a, b) && a.landmass !== "US-AK";
  const channel = !land && channelLink(a, b);
  const drive = land || channel;
  if (!drive) return NO_SURFACE;
  if (a.country === "US") {
    const rail = US_NORTHEAST_CORRIDOR.has(a.id) && US_NORTHEAST_CORRIDOR.has(b.id) ? US_NEC_RAIL_QUALITY : 0;
    return rail > 0 ? US_NEC_SURFACE : US_SURFACE;
  }
  let rail: number;
  if (channel) {
    const mainland = a.landmass === "GB" ? b : a;
    rail = CHANNEL_RAIL_COUNTRIES.has(mainland.country) ? 1 : 0;
  } else {
    rail = Math.min(RAIL_QUALITY_BY_COUNTRY[a.country] ?? RAIL_QUALITY_DEFAULT, RAIL_QUALITY_BY_COUNTRY[b.country] ?? RAIL_QUALITY_DEFAULT);
  }
  return { drive: true, rail, groundKm: EUROPE_GROUND_KM };
}

const NO_SURFACE: SurfaceAlternative = { drive: false, rail: 0, groundKm: US_GROUND_KM };
const US_SURFACE: SurfaceAlternative = { drive: true, rail: 0, groundKm: US_GROUND_KM };
const US_NEC_SURFACE: SurfaceAlternative = { drive: true, rail: US_NEC_RAIL_QUALITY, groundKm: US_GROUND_KM };

// ---------------------------------------------------------------------------
// Seasonal tags
// ---------------------------------------------------------------------------

export type LeisureClass = "medSummer" | "ski" | "winterSun" | "northSummer";

export interface LeisureTag {
  cls: LeisureClass;
  /** 0..1 weight of the tagged curve in the pair's leisure seasonality. */
  strength: number;
}

const SOUTH_EUROPE = new Set(["ES", "PT", "IT", "GR", "CY", "MT", "HR", "ME", "BG", "FR"]);
/** Alpine/Pyrenean/Nordic ski gateways present in the data (ids that do not exist are ignored). Strengths are ESTIMATES. */
const SKI_AIRPORTS: Readonly<Record<string, number>> = {
  INN: 0.8, SZG: 0.7, GNB: 0.8, CMF: 0.8, BZO: 0.7, TRN: 0.25, GVA: 0.3, ZRH: 0.15, MUC: 0.1, LYS: 0.1, KRN: 0.5, OSD: 0.5, TOS: 0.4, EVE: 0.2, HEM: 0.2,
  // US resort airports
  ASE: 0.85, EGE: 0.85, HDN: 0.85, MTJ: 0.7, GUC: 0.85, JAC: 0.7, SUN: 0.85, BZN: 0.5, DRO: 0.4, RNO: 0.2, SLC: 0.15, DEN: 0.12, BTV: 0.2, MSS: 0.2,
};
/** Florida and desert-southwest winter-sun airports (all outside CA/HI/OR/WA, whose seasonality is the pre-expansion calibration). ESTIMATES. */
const WINTER_SUN_AIRPORTS: Readonly<Record<string, number>> = {
  MCO: 0.45, MIA: 0.45, FLL: 0.5, TPA: 0.45, RSW: 0.7, PBI: 0.6, SRQ: 0.6, EYW: 0.6, PIE: 0.5, SFB: 0.4, PHX: 0.4, TUS: 0.35, AZA: 0.3, JAX: 0.15, MYR: 0.2,
};
const NORTH_SUMMER_AIRPORTS: Readonly<Record<string, number>> = {
  ACK: 0.8, MVY: 0.8, HYA: 0.8, BGR: 0.35, PWM: 0.35, TVC: 0.5, MQT: 0.3,
  ANC: 0.75, FAI: 0.8, JNU: 0.85, KTN: 0.85, SIT: 0.85, BET: 0.3, OME: 0.3, OTZ: 0.3, BRW: 0.3, ADQ: 0.5, CDV: 0.7, YAK: 0.8,
};
const NO_TAG_REGIONS = new Set(["CA", "HI", "OR", "WA"]);

/** Seasonal leisure tag of an airport, null when it follows the generic curve. Pre-expansion regions are never tagged. */
export function leisureTag(a: Airport): LeisureTag | null {
  let tag: LeisureTag | null = null;
  if (!(a.country === "US" && NO_TAG_REGIONS.has(a.region))) {
    if (SKI_AIRPORTS[a.id] !== undefined) tag = { cls: "ski", strength: SKI_AIRPORTS[a.id]! };
    else if (a.country === "US" && WINTER_SUN_AIRPORTS[a.id] !== undefined) tag = { cls: "winterSun", strength: WINTER_SUN_AIRPORTS[a.id]! };
    else if (a.country === "US" && NORTH_SUMMER_AIRPORTS[a.id] !== undefined) tag = { cls: "northSummer", strength: NORTH_SUMMER_AIRPORTS[a.id]! };
    else if (a.country !== "US" && SOUTH_EUROPE.has(a.country) && a.lat < 45.6) {
      const s = Math.min(1, Math.max(0, (a.tourismIndex - 0.65) / 0.25));
      if (s > 0) tag = { cls: "medSummer", strength: s };
    }
  }
  return tag;
}
