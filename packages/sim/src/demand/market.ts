import type { Airport, Day } from "@arg/contracts";
import { distanceKm } from "../geo";
import { monthPosition } from "../time/calendar";

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
  incomeExponent: number;
  incomeRefUsd: number;
  /** tourism factor = 1 + tourismBoost * max(tourismA,tourismB)^tourismPower */
  tourismBoost: number;
  tourismPower: number;
}

export const DEFAULT_MARKET_PARAMS: MarketParams = {
  scale: 1790,
  popExponent: 0.6,
  distExponent: 0.4,
  minDistanceKm: 150,
  groundSubstitutionKm: 250,
  incomeExponent: 0.6,
  incomeRefUsd: 75_000,
  tourismBoost: 6,
  tourismPower: 2,
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

/** Annual-average potential one-way weekly passengers for the pair (symmetric). */
export function baseWeeklyDemand(a: Airport, b: Airport, p: MarketParams = DEFAULT_MARKET_PARAMS): number {
  const dTrue = distanceKm(a, b);
  const d = Math.max(dTrue, p.minDistanceKm);
  const ground = dTrue ** 2 / (dTrue ** 2 + p.groundSubstitutionKm ** 2);
  const pop = ((a.metroPopulation / 1e6) * (b.metroPopulation / 1e6)) ** p.popExponent;
  const income = (Math.sqrt(a.gdpPerCapita * b.gdpPerCapita) / p.incomeRefUsd) ** p.incomeExponent;
  const tourism = 1 + p.tourismBoost * pairTourism(a, b) ** p.tourismPower;
  const dist = (d / 1000) ** -p.distExponent;
  return p.scale * pop * income * tourism * dist * ground;
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

export function seasonality(day: Day, segment: Segment, a: Airport, b: Airport): number {
  const pos = monthPosition(day);
  switch (segment) {
    case "business":
      return interp(SEASON_PROFILES.business, pos);
    case "vfr":
      return interp(SEASON_PROFILES.vfr, pos);
    default: {
      const w = hawaiiWeight(a, b);
      return (1 - w) * interp(SEASON_PROFILES.mainlandLeisure, pos) + w * interp(SEASON_PROFILES.hawaiiLeisure, pos);
    }
  }
}

export function pairMarket(a: Airport, b: Airport, p: MarketParams = DEFAULT_MARKET_PARAMS): PairMarket {
  return {
    origin: a.id,
    destination: b.id,
    distanceKm: distanceKm(a, b),
    baseWeekly: baseWeeklyDemand(a, b, p),
    shares: segmentShares(a, b),
  };
}

/** Potential one-way weekly passengers on `day`, split by segment with seasonality applied. */
export function marketOnDay(a: Airport, b: Airport, day: Day, p: MarketParams = DEFAULT_MARKET_PARAMS): DayMarket {
  const base = pairMarket(a, b, p);
  const bySegment = segmentMap((s) => base.baseWeekly * base.shares[s] * seasonality(day, s, a, b));
  const weekly = SEGMENTS.reduce((acc, s) => acc + bySegment[s], 0);
  return { ...base, day, weekly, bySegment };
}
