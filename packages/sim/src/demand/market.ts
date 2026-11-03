import type { Airport, Day } from "@arg/contracts";
import { distanceKm } from "../geo";
import { monthPosition } from "../time/calendar";
import { airportEpoch, airportOpen } from "../world/closures";
import { fareLevel, leisureTag, surfaceAlternative, US_GROUND_KM, type LeisureClass, type SurfaceAlternative } from "../world/regions";
import { catchmentOf, DEFAULT_METROS, type Metro } from "./metros";

export const SEGMENTS = ["business", "leisure", "vfr", "budget"] as const;
export type Segment = (typeof SEGMENTS)[number];
export type SegmentMap<T> = Record<Segment, T>;

export function segmentMap<T>(f: (s: Segment) => T): SegmentMap<T> {
  return { business: f("business"), leisure: f("leisure"), vfr: f("vfr"), budget: f("budget") };
}

/** All constants of the gravity model. See MODEL.md section 1. */
export interface MarketParams {
  /** Scale constant K (passengers/week for a pair with unit factors). */
  scale: number;
  /** Population exponent (population in millions). */
  popExponent: number;
  /** Distance decay exponent (distance in thousands of km). */
  distExponent: number;
  /** Distances below this are treated as this (km) so very short pairs don't explode. */
  minDistanceKm: number;
  /** Income elasticity applied to geometric-mean GDP per capita relative to incomeRef. */
  /** Short-haul damping: factor d^2/(d^2+g^2); ground travel makes very short air pairs small. */
  groundSubstitutionKm: number;
  /** Steepness of the short-haul damping d^n/(d^n+g^n). */
  groundPower: number;
  incomeExponent: number;
  incomeRefUsd: number;
  /** tourism factor = 1 + tourismBoost * max(tourismA,tourismB)^tourismPower */
  tourismBoost: number;
  tourismPower: number;
  /** Multiplier for pairs inside Hawaii (no road alternative, dense business/VFR flows between islands). */
  interislandBoost: number;
  /** Same idea for other island groups of one country (Canaries, Balearics, Greek islands, Sicily/Sardinia to each other): ESTIMATE, smaller than Hawaii's because those pairs are fewer and shorter-lived. Absent = 1. */
  islandHopBoost?: number;
  /** Longest island-to-island hop (km) that gets `islandHopBoost`. */
  islandHopMaxKm?: number;
  /** Multi-airport metro catchments (null/undefined: every airport counts its whole metro population). */
  metros?: readonly Metro[] | null;
  /** Compound annual growth of the whole market from day 0 (2015); 0 disables. Pandemic shocks are not modelled. */
  growthPerYear?: number;
}

export const DEFAULT_MARKET_PARAMS: MarketParams = {
  scale: 1780,
  popExponent: 0.47,
  distExponent: 0.25,
  minDistanceKm: 150,
  groundSubstitutionKm: 150,
  groundPower: 3,
  incomeExponent: 1.28,
  incomeRefUsd: 75_000,
  tourismBoost: 1.7,
  tourismPower: 3,
  interislandBoost: 12.5,
  islandHopBoost: 4,
  islandHopMaxKm: 700,
  metros: DEFAULT_METROS,
  growthPerYear: 0.025,
};

export interface PairMarket {
  origin: string;
  destination: string;
  distanceKm: number;
  /** Annual-average potential one-way passengers/week (all carriers, before the outside option). */
  baseWeekly: number;
  shares: SegmentMap<number>;
}

export interface DayMarket extends PairMarket {
  day: Day;
  /** Seasonal potential one-way passengers/week at `day`. */
  weekly: number;
  bySegment: SegmentMap<number>;
}

/** Pair "tourism pull": the more touristy end dominates. 0..1. */
export function pairTourism(a: Airport, b: Airport): number {
  return Math.max(a.tourismIndex, b.tourismIndex);
}

/**
 * True when a road trip between the two airports is a practical alternative to flying (`surfaceAlternative`, world/regions.ts):
 * same landmass, except Alaska (roadless), plus UK-continent through the Channel Tunnel. Anything crossing water (HI-HI, HI-mainland,
 * CONUS-AK, island pairs) has none, so short-haul ground damping must not apply. CA, OR and WA are one mainland (CA-OR, OR-WA, ...
 * all count as land pairs); the distance terms in the damping and in the drive outside option make the road irrelevant on long pairs
 * such as SAN-SEA or MAD-HEL.
 */
export function hasSurfaceAlternative(a: Airport, b: Airport): boolean {
  return surfaceAlternative(a, b).drive;
}

export { surfaceAlternative, fareLevel };

export type { SurfaceAlternative };

const MAINLAND_LANDMASSES = new Set(["US-CONUS", "US-AK", "EU-MAINLAND", "GB", "IE"]);

/** Demand multiplier for short hops between islands of one group (Hawaii: `interislandBoost`; other archipelagos: `islandHopBoost`). */
function islandBoost(a: Airport, b: Airport, d: number, p: MarketParams): number {
  if (a.region === "HI" && b.region === "HI") return p.interislandBoost;
  if (p.islandHopBoost === undefined || p.islandHopBoost === 1) return 1;
  if (a.country !== b.country || a.landmass === b.landmass || a.country === "US") return 1;
  if (MAINLAND_LANDMASSES.has(a.landmass) || MAINLAND_LANDMASSES.has(b.landmass)) return 1;
  return d <= (p.islandHopMaxKm ?? 700) ? p.islandHopBoost : 1;
}

interface PairCacheEntry { base: number; shares: SegmentMap<number> }
const pairCache = new WeakMap<MarketParams, WeakMap<Airport, Map<string, PairCacheEntry>>>();

/** Outside the closure/opening calendar nothing changes, so the cache key only needs the epoch (number of events so far). */
function pairCached(a: Airport, b: Airport, p: MarketParams, day: Day | undefined): PairCacheEntry {
  let byA = pairCache.get(p);
  if (!byA) pairCache.set(p, (byA = new WeakMap()));
  let m = byA.get(a);
  if (!m) byA.set(a, (m = new Map()));
  const key = `${b.id}|${day === undefined ? -1 : airportEpoch(day)}`;
  let hit = m.get(key);
  if (!hit) {
    hit = { base: computeBaseWeekly(a, b, p, day), shares: segmentShares(a, b) };
    m.set(key, hit);
  }
  return hit;
}

/**
 * Annual-average potential one-way weekly passengers for the pair (symmetric). Cached per airport pair (the inputs are fixed data);
 * with `day`, airports closed on that day get no demand and their metro siblings take the share (world/closures.ts).
 */
export function baseWeeklyDemand(a: Airport, b: Airport, p: MarketParams = DEFAULT_MARKET_PARAMS, day?: Day): number {
  return pairCached(a, b, p, day).base;
}

function computeBaseWeekly(a: Airport, b: Airport, p: MarketParams, day: Day | undefined): number {
  if (day !== undefined && (!airportOpen(a.id, day) || !airportOpen(b.id, day))) return 0;
  const dTrue = distanceKm(a, b);
  const d = Math.max(dTrue, p.minDistanceKm);
  const sf = surfaceAlternative(a, b);
  // The calibrated US damping distance is `groundSubstitutionKm`; Europe scales it by its (stronger) ratio from world/regions.ts.
  const gKm = p.groundSubstitutionKm * (sf.groundKm / US_GROUND_KM);
  const ground = sf.drive ? dTrue ** p.groundPower / (dTrue ** p.groundPower + gKm ** p.groundPower) : 1;
  const island = islandBoost(a, b, dTrue, p);
  const ca = catchmentOf(a.id, a.metroPopulation, p.metros, dTrue, undefined, day);
  const cb = catchmentOf(b.id, b.metroPopulation, p.metros, dTrue, undefined, day);
  const pop = ((ca.population / 1e6) * (cb.population / 1e6)) ** p.popExponent;
  const income = (Math.sqrt(a.gdpPerCapita * b.gdpPerCapita) / p.incomeRefUsd) ** p.incomeExponent;
  const tourism = 1 + p.tourismBoost * pairTourism(a, b) ** p.tourismPower;
  const dist = (d / 1000) ** -p.distExponent;
  return p.scale * pop * income * tourism * dist * ground * island * ca.share * cb.share;
}

/**
 * Segment shares (sum to 1) from distance and tourism.
 * Business is highest on short/medium non-tourist pairs; leisure and budget rise with tourism;
 * VFR rises mildly with distance (families are far apart) and falls with tourism.
 */
export function segmentShares(a: Airport, b: Airport): SegmentMap<number> {
  const d = distanceKm(a, b);
  const t = pairTourism(a, b) ** 1.5;
  const distDecay = 1 / (1 + (d / 4000) ** 1.5); // 1 short, ~0.5 at 4000 km
  const raw: SegmentMap<number> = {
    business: 0.42 * (1 - 0.7 * t) * (0.55 + 0.45 * distDecay),
    leisure: 0.3 + 0.32 * t,
    vfr: (0.15 + 0.06 * Math.min(1, d / 2500)) * (1 - 0.3 * t),
    budget: 0.14 + 0.06 * (1 - t),
  };
  const sum = SEGMENTS.reduce((acc, s) => acc + raw[s], 0);
  return segmentMap((s) => raw[s] / sum);
}

// ---------------------------------------------------------------------------
// Seasonality. 12 monthly indices (Jan..Dec), normalised to mean 1, linearly interpolated
// between month centres so daily demand is smooth.
// ---------------------------------------------------------------------------
function normalise(xs: readonly number[]): number[] {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.map((x) => x / m);
}

export const SEASON_PROFILES = {
  /** Mainland leisure: summer bump, mild winter trough. */
  mainlandLeisure: normalise([0.88, 0.9, 1.0, 1.0, 1.02, 1.12, 1.16, 1.1, 0.96, 0.96, 0.98, 1.02]),
  /** Hawaii leisure: summer peak plus a December/holiday peak, September-October trough. */
  hawaiiLeisure: normalise([0.95, 0.9, 1.05, 1.0, 0.93, 1.15, 1.25, 1.15, 0.8, 0.8, 0.9, 1.25]),
  /** Business: dips in July/August and late December. */
  business: normalise([0.96, 1.02, 1.06, 1.05, 1.05, 1.0, 0.9, 0.92, 1.05, 1.08, 1.05, 0.86]),
  /** VFR: Thanksgiving/Christmas and summer. */
  vfr: normalise([0.88, 0.88, 0.95, 0.97, 0.98, 1.08, 1.12, 1.04, 0.92, 0.95, 1.12, 1.2]),
  // --- Regions added with the whole-US/Europe expansion. All shapes are ESTIMATES (MODEL.md section 12), peak-to-trough ratios chosen
  // to match what is generally known: the Mediterranean summer is about three times the winter, Alpine winter resorts peak Dec-Mar,
  // Florida peaks Feb-Apr, Alaska and New England islands peak Jun-Aug, and August is the weakest European business month.
  /** Any leisure pair with a European end that is not a tagged resort: a pronounced July/August peak. */
  europeLeisure: normalise([0.75, 0.78, 0.9, 1.05, 1.12, 1.2, 1.35, 1.4, 1.1, 0.95, 0.8, 0.9]),
  /** European business: August trough (-25%), December dip. */
  europeBusiness: normalise([0.92, 1.04, 1.1, 1.06, 1.06, 1.06, 0.96, 0.72, 1.04, 1.1, 1.08, 0.86]),
  /** European VFR: Christmas, Easter and the summer holidays. */
  europeVfr: normalise([0.85, 0.85, 0.95, 1.05, 0.98, 1.0, 1.18, 1.25, 0.95, 0.92, 0.95, 1.2]),
  /** Mediterranean sun destinations (Balearics, Canaries excluded in winter bias, Greece, Croatia, Riviera): summer about 3x winter. */
  medSummer: normalise([0.55, 0.55, 0.7, 0.95, 1.2, 1.5, 1.75, 1.8, 1.4, 1.0, 0.6, 0.6]),
  /** Ski gateways: Dec-Mar peak, spring and autumn trough. */
  ski: normalise([1.45, 1.5, 1.3, 0.75, 0.45, 0.5, 0.7, 0.75, 0.5, 0.5, 0.75, 1.55]),
  /** US winter-sun (Florida, desert southwest): Jan-Apr peak, late-summer trough. */
  winterSun: normalise([1.25, 1.35, 1.4, 1.3, 0.95, 0.8, 0.8, 0.75, 0.65, 0.8, 0.95, 1.1]),
  /** Northern summer destinations (Alaska, New England islands, Great Lakes resorts). */
  northSummer: normalise([0.45, 0.5, 0.6, 0.8, 1.15, 1.6, 1.9, 1.8, 1.2, 0.7, 0.5, 0.6]),
} as const;

function interp(profile: readonly number[], pos: number): number {
  // profile[i] is the value at the middle of month i (pos = i + 0.5)
  const x = pos - 0.5;
  const i0 = Math.floor(x);
  const f = x - i0;
  const a = profile[((i0 % 12) + 12) % 12] ?? 1;
  const b = profile[(((i0 + 1) % 12) + 12) % 12] ?? 1;
  return a + (b - a) * f;
}

/** 0..1 weight of the Hawaii-style leisure curve for this pair. */
export function hawaiiWeight(a: Airport, b: Airport): number {
  if (a.region === "HI" || b.region === "HI") return 1;
  return 0.3 * pairTourism(a, b);
}

const europeInvolved = (a: Airport, b: Airport) => a.country !== "US" || b.country !== "US";

/**
 * The seasonal leisure resort class of a pair and its weight: the tagged end with the larger strength wins (Hawaii is weight 1 as
 * before). Null when neither end is tagged. CA, OR, WA and HI airports are never tagged, so their pairs keep the original curves.
 */
function dominantTag(a: Airport, b: Airport): { cls: LeisureClass; strength: number } | null {
  const ta = leisureTag(a), tb = leisureTag(b);
  if (ta && tb) return ta.strength >= tb.strength ? ta : tb;
  return ta ?? tb;
}

let posDay = Number.NaN;
let posVal = 0;
/** monthPosition with a one-entry memo: the market is evaluated for hundreds of pairs on the same day. */
function monthPos(day: Day): number {
  if (day !== posDay) { posVal = monthPosition(day); posDay = day; }
  return posVal;
}

export function seasonality(day: Day, segment: Segment, a: Airport, b: Airport): number {
  const pos = monthPos(day);
  const eu = europeInvolved(a, b);
  switch (segment) {
    case "business":
      return interp(eu ? SEASON_PROFILES.europeBusiness : SEASON_PROFILES.business, pos);
    case "vfr":
      return interp(eu ? SEASON_PROFILES.europeVfr : SEASON_PROFILES.vfr, pos);
    default: {
      if (a.region === "HI" || b.region === "HI") {
        return interp(SEASON_PROFILES.hawaiiLeisure, pos);
      }
      const tag = dominantTag(a, b);
      if (tag) {
        const base = interp(eu ? SEASON_PROFILES.europeLeisure : SEASON_PROFILES.mainlandLeisure, pos);
        return (1 - tag.strength) * base + tag.strength * interp(SEASON_PROFILES[tag.cls], pos);
      }
      if (eu) return interp(SEASON_PROFILES.europeLeisure, pos);
      const w = hawaiiWeight(a, b);
      return (1 - w) * interp(SEASON_PROFILES.mainlandLeisure, pos) + w * interp(SEASON_PROFILES.hawaiiLeisure, pos);
    }
  }
}

export function pairMarket(a: Airport, b: Airport, p: MarketParams = DEFAULT_MARKET_PARAMS, day?: Day): PairMarket {
  const c = pairCached(a, b, p, day);
  return {
    origin: a.id,
    destination: b.id,
    distanceKm: distanceKm(a, b),
    baseWeekly: c.base,
    shares: c.shares,
  };
}

/** Potential one-way weekly passengers on `day`, split by segment with seasonality applied. Zero when either airport is closed that day. */
export function marketOnDay(a: Airport, b: Airport, day: Day, p: MarketParams = DEFAULT_MARKET_PARAMS): DayMarket {
  const base = pairMarket(a, b, p, day);
  const growth = (1 + (p.growthPerYear ?? 0)) ** (day / 365.25);
  const bySegment = segmentMap((s) => base.baseWeekly * growth * base.shares[s] * seasonality(day, s, a, b));
  const weekly = SEGMENTS.reduce((acc, s) => acc + bySegment[s], 0);
  return { ...base, day, weekly, bySegment };
}
