import type { AircraftType, CabinClass, CabinLayout } from "@arg/contracts";
import { defaultLayout } from "../fleet/layout";
import type { SegmentMap } from "../demand/market";
import { cabinGeometry } from "./geometry";
import { CABIN_CLASSES, INCH_M, sectionSeats, totalSeats } from "./rules";

/**
 * Cabin effect model. Everything is measured against the type's reference layout (`defaultLayout`, the cabin the
 * game already uses), so the default layout gives neutral effects (quality 0.5, multipliers 1) and today's numbers.
 */
export const CABIN_PARAMS = {
  /** Benchmark seat pitch (in) and seat-space width (in) per class and body (1.0 comfort at the benchmark). */
  pitchBench: { F: 78, J: { narrow: 38, wide: 60 }, W: 38, Y: 31 },
  widthBench: { F: 40, J: { narrow: 24, wide: 34 }, W: 19, Y: 17.5 },
  aisleIn: { narrow: 18, wide: 20 },
  armrestIn: 2.2,
  wallIn: 3,
  /** Weight of pitch vs width in class comfort. */
  pitchWeight: 0.6,
  /** Seat weight of each class when averaging comfort (revenue/brand importance). */
  classWeight: { F: 4, J: 3, W: 1.8, Y: 1 } as Record<CabinClass, number>,
  /** Quality index = 0.5 + comfortGain x (comfort - refComfort) + premiumGain x (premiumWeight - refPremiumWeight). */
  comfortGain: 1.0,
  premiumGain: 0.25,
  qualityMin: 0.35,
  qualityMax: 0.7,
  /** Catering/service cost per passenger relative to economy. */
  serviceCost: { F: 6, J: 3.5, W: 1.5, Y: 1 } as Record<CabinClass, number>,
  /** Seats per flight attendant by class. */
  seatsPerFA: { F: 10, J: 16, W: 28, Y: 40 } as Record<CabinClass, number>,
  /** Share of each segment that wants each class on an average-length route. */
  propensity: {
    business: { F: 0.04, J: 0.28, W: 0.18, Y: 0.5 },
    leisure: { F: 0.005, J: 0.02, W: 0.1, Y: 0.875 },
    vfr: { F: 0, J: 0.01, W: 0.05, Y: 0.94 },
    budget: { F: 0, J: 0, W: 0.01, Y: 0.99 },
  } as Record<keyof SegmentMap<number>, Record<CabinClass, number>>,
  /** Segment mix assumed when a caller supplies none. */
  averageMix: { business: 0.25, leisure: 0.45, vfr: 0.2, budget: 0.1 } as SegmentMap<number>,
  /** Premium propensity multiplier by stage length: 0.6 at 0 km up to 1.3 beyond 6000 km. */
  distanceMin: 0.6,
  distanceMax: 1.3,
  distanceFullKm: 6000,
  /** Fraction of unserved class demand that trades down to the next class (rest buys economy). */
  tradeDown: 1,
  /** Fill-weight multiplier bounds applied to the ledger's cabin fill weights. */
  fillRatioMin: 0.25,
  fillRatioMax: 1.6,
} as const;

export interface EffectsContext {
  /** Segment mix of the route market (sums to 1). Defaults to the network average. */
  shares?: SegmentMap<number>;
  routeKm?: number;
}

export interface ClassMetrics {
  cls: CabinClass;
  seats: number;
  rows: number;
  across: number;
  pitchIn: number;
  seatWidthIn: number;
  /** About 1.0 at benchmark. */
  comfort: number;
}

export interface LayoutEffects {
  byClass: ClassMetrics[];
  seatsByClass: Record<CabinClass, number>;
  totalSeats: number;
  maxSeats: number;
  /** 0..100, 60 at benchmark comfort. */
  comfortScore: number;
  /** Seat-weighted comfort ratio (1.0 at benchmark). */
  comfortIndex: number;
  /** Premium seats (F, J, W) over all seats. */
  premiumShare: number;
  /** Demand-side quality for the choice model, 0.5 neutral (the route model's old constant). */
  qualityIndex: number;
  /** Brand effect in points (quality - 0.5) x 100 vs the reference cabin. */
  brandPoints: number;
  /** Passenger satisfaction 0..100 and change vs the reference cabin. */
  satisfaction: number;
  satisfactionDelta: number;
  /** Multiplier on passenger-services cost per passenger vs the reference cabin. */
  serviceCostMultiplier: number;
  /** Seat count to use for flight-attendant staffing, vs `totalSeats`; premium cabins need more crew. */
  crewSeatEquivalent: number;
  /** Trip cost per seat relative to the reference cabin (more for fewer seats; about 1/seats). */
  costPerSeatIndex: number;
}

function seatWidthIn(type: AircraftType, across: number, cls: CabinClass): number {
  const geo = cabinGeometry(type);
  const P = CABIN_PARAMS;
  const body = geo.bodyClass === "widebody" ? "wide" : "narrow";
  const space = (geo.cabinWidthM / INCH_M - P.wallIn - geo.aisles * P.aisleIn[body]) / across;
  return cls === "Y" || cls === "W" ? space - P.armrestIn : space;
}

function bench(type: AircraftType, cls: CabinClass): { pitch: number; width: number } {
  const wide = type.widebody;
  const pick = <T,>(v: T | { narrow: T; wide: T }): T => (typeof v === "object" && v !== null && "narrow" in v ? (wide ? v.wide : v.narrow) : (v as T));
  return { pitch: pick(CABIN_PARAMS.pitchBench[cls] as never) as number, width: pick(CABIN_PARAMS.widthBench[cls] as never) as number };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function metrics(type: AircraftType, layout: CabinLayout): ClassMetrics[] {
  return CABIN_CLASSES.flatMap((cls) => {
    const s = layout.sections.find((x) => x.cls === cls);
    if (!s || s.rows < 1) return [];
    const b = bench(type, cls);
    const w = seatWidthIn(type, s.seatsAcross, cls);
    const comfort = CABIN_PARAMS.pitchWeight * clamp(s.pitchIn / b.pitch, 0.6, 1.2) + (1 - CABIN_PARAMS.pitchWeight) * clamp(w / b.width, 0.6, 1.15);
    return [{ cls, seats: sectionSeats(s), rows: s.rows, across: s.seatsAcross, pitchIn: s.pitchIn, seatWidthIn: w, comfort }];
  });
}

function weightedComfort(m: ClassMetrics[]): number {
  let n = 0, d = 0;
  for (const c of m) { const w = c.seats * CABIN_PARAMS.classWeight[c.cls]; n += w * c.comfort; d += w; }
  return d > 0 ? n / d : 1;
}
function premiumWeight(m: ClassMetrics[]): number {
  const tot = m.reduce((s, c) => s + c.seats, 0);
  if (tot === 0) return 0;
  return m.reduce((s, c) => s + (c.seats * (CABIN_PARAMS.classWeight[c.cls] - 1)) / 3, 0) / tot;
}
function serviceLoad(m: ClassMetrics[]): number {
  const tot = m.reduce((s, c) => s + c.seats, 0);
  return tot > 0 ? m.reduce((s, c) => s + c.seats * CABIN_PARAMS.serviceCost[c.cls], 0) / tot : 1;
}
function crewSeats(m: ClassMetrics[]): number {
  const fas = m.reduce((s, c) => s + c.seats / CABIN_PARAMS.seatsPerFA[c.cls], 0);
  return fas * CABIN_PARAMS.seatsPerFA.Y;
}

/** Effects of `layout` on `type`, relative to the type's reference layout. Pure. */
export function layoutEffects(type: AircraftType, layout: CabinLayout, _ctx: EffectsContext = {}): LayoutEffects {
  const m = metrics(type, layout);
  const refM = metrics(type, defaultLayout(type));
  const P = CABIN_PARAMS;
  const comfortIndex = weightedComfort(m);
  const refComfort = weightedComfort(refM);
  const qualityIndex = clamp(0.5 + P.comfortGain * (comfortIndex - refComfort) + P.premiumGain * (premiumWeight(m) - premiumWeight(refM)), P.qualityMin, P.qualityMax);
  const seats = totalSeats(layout);
  const refSeats = totalSeats(defaultLayout(type));
  const seatsByClass = { F: 0, J: 0, W: 0, Y: 0 } as Record<CabinClass, number>;
  for (const c of m) seatsByClass[c.cls] += c.seats;
  // Satisfaction: comfort drives it (60 at benchmark, +-40 per 0.25), premium seats add a little.
  const sat = (idx: number, prem: number) => clamp(60 + 160 * (idx - 1) + 10 * prem, 0, 100);
  const satisfaction = sat(comfortIndex, premiumWeight(m));
  const refSat = sat(refComfort, premiumWeight(refM));
  const refCrew = crewSeats(refM);
  return {
    byClass: m,
    seatsByClass,
    totalSeats: seats,
    maxSeats: type.maxSeats,
    comfortScore: Math.round(clamp(60 + 150 * (comfortIndex - 1), 0, 100)),
    comfortIndex,
    premiumShare: seats > 0 ? (seatsByClass.F + seatsByClass.J + seatsByClass.W) / seats : 0,
    qualityIndex,
    brandPoints: (qualityIndex - 0.5) * 100,
    satisfaction,
    satisfactionDelta: satisfaction - refSat,
    serviceCostMultiplier: serviceLoad(m) / serviceLoad(refM),
    crewSeatEquivalent: refCrew > 0 ? (crewSeats(m) / refCrew) * refSeats : seats,
    costPerSeatIndex: seats > 0 ? refSeats / seats : 1,
  };
}

// ---------------------------------------------------------------------------
// Per-cabin demand
// ---------------------------------------------------------------------------

/** Share of passengers wanting each class given the market's segment mix and the stage length. */
export function classDemandShares(shares: SegmentMap<number>, routeKm: number): Record<CabinClass, number> {
  const P = CABIN_PARAMS;
  const f = P.distanceMin + (P.distanceMax - P.distanceMin) * clamp(routeKm / P.distanceFullKm, 0, 1);
  const out = { F: 0, J: 0, W: 0, Y: 0 } as Record<CabinClass, number>;
  for (const seg of Object.keys(P.propensity) as (keyof SegmentMap<number>)[]) {
    const p = P.propensity[seg];
    for (const cls of ["F", "J", "W"] as const) out[cls] += shares[seg] * p[cls] * f;
  }
  out.Y = Math.max(0, 1 - out.F - out.J - out.W);
  return out;
}

/** Passengers carried per class on one flight: demand per class, spilling excess down to the next class, capped at seats. */
export function allocateByDemand(seats: Record<CabinClass, number>, want: Record<CabinClass, number>): Record<CabinClass, number> {
  const out = { F: 0, J: 0, W: 0, Y: 0 } as Record<CabinClass, number>;
  let carry = 0;
  for (const cls of CABIN_CLASSES) {
    const demand = want[cls] + carry;
    const served = Math.min(demand, seats[cls]);
    out[cls] = served;
    const excess = demand - served;
    carry = cls === "Y" ? 0 : excess * CABIN_PARAMS.tradeDown;
  }
  return out;
}

/**
 * Multipliers on the ledger's static cabin fill weights, so that premium cabins load according to the market's
 * business/premium demand. For the reference layout the multipliers are exactly 1 (today's numbers). Method: pax per
 * seat in each class under the demand model for this layout over the same for the reference layout, with demand fixed
 * to `paxPerFlight` passengers, bounded to [fillRatioMin, fillRatioMax].
 * Limitation: the choice model still sees one Y fare; the cabin split only reallocates carried passengers among cabins.
 */
export function cabinFillRatios(type: AircraftType, layout: CabinLayout, paxPerFlight: number, ctx: EffectsContext = {}): Record<CabinClass, number> {
  const P = CABIN_PARAMS;
  const mix = ctx.shares ?? P.averageMix;
  const km = ctx.routeKm ?? 1500;
  const shares = classDemandShares(mix, km);
  // The reference layout sees the same market, so the default cabin is exactly neutral on every route.
  const refShares = shares;
  const ref = defaultLayout(type);
  const seatsOf = (l: CabinLayout) => { const o = { F: 0, J: 0, W: 0, Y: 0 } as Record<CabinClass, number>; for (const s of l.sections) o[s.cls] += sectionSeats(s); return o; };
  const sL = seatsOf(layout), sR = seatsOf(ref);
  const wantOf = (sh: Record<CabinClass, number>) => ({ F: sh.F * paxPerFlight, J: sh.J * paxPerFlight, W: sh.W * paxPerFlight, Y: sh.Y * paxPerFlight });
  const xL = allocateByDemand(sL, wantOf(shares));
  const xR = allocateByDemand(sR, wantOf(refShares));
  const refTotal = sR.F + sR.J + sR.W + sR.Y;
  const out = { F: 1, J: 1, W: 1, Y: 1 } as Record<CabinClass, number>;
  for (const cls of CABIN_CLASSES) {
    if (sL[cls] <= 0) continue;
    const loadL = xL[cls] / sL[cls];
    const loadR = sR[cls] > 0 ? xR[cls] / sR[cls] : refTotal > 0 ? paxPerFlight / refTotal : 1;
    out[cls] = loadR > 1e-9 ? clamp(loadL / loadR, P.fillRatioMin, P.fillRatioMax) : 1;
  }
  return out;
}

/** Seat comfort per cabin class of a layout (1.0 at benchmark), for the passenger-experience model. Pure. */
export function comfortByClass(type: AircraftType, layout: CabinLayout): Partial<Record<CabinClass, number>> {
  const out: Partial<Record<CabinClass, number>> = {};
  for (const c of metrics(type, layout)) out[c.cls] = c.comfort;
  return out;
}
