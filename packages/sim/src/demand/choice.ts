import { SEGMENTS, segmentMap, type Segment, type SegmentMap } from "./market";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Leg {
  /** Capacity identity: itineraries sharing a leg id compete for the same seats. */
  id: string;
  origin: string;
  destination: string;
  distanceKm: number;
  /** Gate-to-gate minutes. */
  blockMin: number;
  /** Departures per week in this direction. */
  weeklyFrequency: number;
  /** Seats per week in this direction (frequency x seats per departure). */
  weeklySeats: number;
}

export interface Itinerary {
  id: string;
  carrier: string;
  legs: Leg[];
  /** Average one-way fare in USD that a price-comparing passenger sees (economy-equivalent). */
  fare: number;
  /** Brand / service quality, 0..1 where 0.5 is neutral. */
  quality: number;
}

export interface OutsideContext {
  /** Great-circle distance of the market. */
  distanceKm: number;
  /** True when driving is a real alternative (same landmass). */
  driveAvailable: boolean;
}

export interface SegmentChoiceParams {
  /** Value of time, USD per hour. */
  vot: number;
  /** Logit scale: USD of generalised cost per utility unit (smaller = more price sensitive). */
  theta: number;
  /** Exponent on the frequency S-curve (log weight). */
  freqLambda: number;
  /** Weekly frequency at which the S-curve is at 50%. */
  freqHalf: number;
  /** Utility per 1.0 of (quality - 0.5). */
  qualityWeight: number;
  /** Not-travelling generalised cost = this x the benchmark itinerary generalised cost. */
  noTravelMultiplier: number;
  /** Share of spilled passengers who re-choose among remaining options. */
  recapture: number;
}

export interface ChoiceParams {
  segments: SegmentMap<SegmentChoiceParams>;
  /** S-curve steepness k in f^k / (f^k + f0^k). */
  freqSteepness: number;
  /** Frequency of a connecting itinerary = min(leg frequencies) x this. */
  connectionFrequencyFactor: number;
  /** Minimum connection time (min). */
  minConnectMin: number;
  /** Extra layover = layoverHeadwayFactor x headway of the less frequent leg, capped. */
  layoverHeadwayFactor: number;
  layoverCapMin: number;
  /** Fixed hassle of connecting, expressed in minutes of travel time. */
  connectPenaltyMin: number;
  /** Misconnect probability baseline and extra when layover < tightConnectMin. */
  misconnectBase: number;
  misconnectTightExtra: number;
  tightConnectMin: number;
  /** Minutes of delay when a connection is missed. */
  misconnectDelayMin: number;
  /** Driving: road distance / great circle, speed, USD per road km per person. */
  driveCircuity: number;
  driveKmh: number;
  driveUsdPerKm: number;
  /** Fraction of VOT that applies to time spent driving. */
  driveVotFactor: number;
  /** Air-benchmark used to size the no-travel option. */
  benchmarkSpeedKmh: number;
  benchmarkOverheadH: number;
  /** Number of recapture rounds after the unconstrained choice. */
  recapturePasses: number;
}

export const DEFAULT_CHOICE_PARAMS: ChoiceParams = {
  segments: {
    business: { vot: 70, theta: 60, freqLambda: 1.0, freqHalf: 12, qualityWeight: 1.2, noTravelMultiplier: 1.6, recapture: 0.7 },
    leisure: { vot: 24, theta: 45, freqLambda: 0.75, freqHalf: 6, qualityWeight: 0.8, noTravelMultiplier: 1.35, recapture: 0.6 },
    vfr: { vot: 18, theta: 40, freqLambda: 0.7, freqHalf: 5, qualityWeight: 0.6, noTravelMultiplier: 1.4, recapture: 0.5 },
    budget: { vot: 10, theta: 25, freqLambda: 0.6, freqHalf: 5, qualityWeight: 0.4, noTravelMultiplier: 1.3, recapture: 0.55 },
  },
  freqSteepness: 2.5,
  connectionFrequencyFactor: 0.6,
  minConnectMin: 60,
  layoverHeadwayFactor: 0.1,
  layoverCapMin: 180,
  connectPenaltyMin: 60,
  misconnectBase: 0.05,
  misconnectTightExtra: 0.1,
  tightConnectMin: 90,
  misconnectDelayMin: 300,
  driveCircuity: 1.25,
  driveKmh: 95,
  driveUsdPerKm: 0.14,
  driveVotFactor: 0.8,
  benchmarkSpeedKmh: 800,
  benchmarkOverheadH: 0.6,
  recapturePasses: 3,
};

/** Benchmark economy-equivalent one-way fare for a distance (USD): 64 + 0.265 d^0.8. LAX-SFO ~ 105, LAX-HNL ~ 270. */
export function benchmarkFare(distanceKm: number): number {
  return 64 + 0.265 * Math.max(distanceKm, 0) ** 0.8;
}

// ---------------------------------------------------------------------------
// Itinerary attributes
// ---------------------------------------------------------------------------

export function isConnecting(it: Itinerary): boolean {
  return it.legs.length > 1;
}

/** Effective weekly frequency for the schedule-fit curve. */
export function effectiveFrequency(it: Itinerary, p: ChoiceParams = DEFAULT_CHOICE_PARAMS): number {
  const minF = Math.min(...it.legs.map((l) => l.weeklyFrequency));
  return isConnecting(it) ? minF * p.connectionFrequencyFactor : minF;
}

/** Layover minutes between consecutive legs (0 for direct). */
export function layoverMin(it: Itinerary, p: ChoiceParams = DEFAULT_CHOICE_PARAMS): number {
  if (!isConnecting(it)) return 0;
  const minF = Math.max(0.01, Math.min(...it.legs.map((l) => l.weeklyFrequency)));
  const headway = 10080 / minF;
  return (it.legs.length - 1) * (p.minConnectMin + Math.min(p.layoverCapMin, p.layoverHeadwayFactor * headway));
}

export function misconnectProbability(it: Itinerary, p: ChoiceParams = DEFAULT_CHOICE_PARAMS): number {
  if (!isConnecting(it)) return 0;
  const perConn = layoverMin(it, p) / (it.legs.length - 1);
  const tight = Math.max(0, (p.tightConnectMin - perConn) / p.tightConnectMin);
  return (it.legs.length - 1) * (p.misconnectBase + p.misconnectTightExtra * tight);
}

/** Elapsed door-to-door-ish minutes: block times plus layovers. */
export function elapsedMin(it: Itinerary, p: ChoiceParams = DEFAULT_CHOICE_PARAMS): number {
  return it.legs.reduce((s, l) => s + l.blockMin, 0) + layoverMin(it, p);
}

/** Frequency S-curve in 0..1. */
export function scheduleFit(freq: number, half: number, k: number): number {
  if (freq <= 0) return 0;
  const a = freq ** k;
  return a / (a + half ** k);
}

export interface UtilityBreakdown {
  fare: number;
  time: number;
  connection: number;
  schedule: number;
  quality: number;
  total: number;
}

/** Utility terms (in logit units) of an itinerary for a segment. Fare/time/connection are negative. */
export function itineraryUtility(
  it: Itinerary,
  seg: Segment,
  p: ChoiceParams = DEFAULT_CHOICE_PARAMS,
): UtilityBreakdown {
  const sp = p.segments[seg];
  const fare = -it.fare / sp.theta;
  const time = -(sp.vot * (elapsedMin(it, p) / 60)) / sp.theta;
  const connection = isConnecting(it)
    ? -(sp.vot * ((p.connectPenaltyMin + misconnectProbability(it, p) * p.misconnectDelayMin) / 60)) / sp.theta
    : 0;
  const fit = scheduleFit(effectiveFrequency(it, p), sp.freqHalf, p.freqSteepness);
  const schedule = fit > 0 ? sp.freqLambda * Math.log(fit) : -Infinity;
  const quality = sp.qualityWeight * (it.quality - 0.5);
  return { fare, time, connection, schedule, quality, total: fare + time + connection + schedule + quality };
}

/** Log-weight of the outside option (driving and/or not travelling) for a segment. */
export function outsideUtility(seg: Segment, ctx: OutsideContext, p: ChoiceParams = DEFAULT_CHOICE_PARAMS): number {
  const sp = p.segments[seg];
  const benchGc = benchmarkFare(ctx.distanceKm) + sp.vot * (ctx.distanceKm * 1.04 / p.benchmarkSpeedKmh + p.benchmarkOverheadH);
  const noTravel = Math.exp(-(sp.noTravelMultiplier * benchGc) / sp.theta);
  let drive = 0;
  if (ctx.driveAvailable) {
    const road = ctx.distanceKm * p.driveCircuity;
    const gc = p.driveUsdPerKm * road + sp.vot * p.driveVotFactor * (road / p.driveKmh);
    drive = Math.exp(-gc / sp.theta);
  }
  return Math.log(noTravel + drive);
}

// ---------------------------------------------------------------------------
// Choice with spill and recapture
// ---------------------------------------------------------------------------

export interface ItineraryResult {
  id: string;
  /** Passengers carried per week by segment. */
  bySegment: SegmentMap<number>;
  passengers: number;
  /** What the first-pass logit would have sent here before capacity limits. */
  unconstrained: number;
  /** Passengers rejected here at any pass. */
  spilled: number;
  /** Passengers that arrived here by re-choosing after being spilled elsewhere. */
  recaptured: number;
}

export interface ChoiceTotals {
  demand: number;
  captured: number;
  /** Chose driving / not travelling in the first pass. */
  lostToOutside: number;
  /** Spilled passengers that did not try to re-choose (1 - recapture rate). */
  lostNotRecaptured: number;
  /** Spilled passengers who wanted to re-choose but every option was full. */
  lostNoSeats: number;
  /** Spill left over after the final recapture pass. */
  unservedSpill: number;
}

export interface ChoiceResult {
  itineraries: ItineraryResult[];
  totals: ChoiceTotals;
  legs: Record<string, { capacity: number; load: number; loadFactor: number }>;
  /** Unconstrained first-pass share of total demand per itinerary (for UI). */
  passesUsed: number;
}

export interface ChoiceInput {
  demand: SegmentMap<number>;
  itineraries: Itinerary[];
  outside: OutsideContext;
  params?: ChoiceParams;
}

export function runChoice(input: ChoiceInput): ChoiceResult {
  const p = input.params ?? DEFAULT_CHOICE_PARAMS;
  const its = input.itineraries;
  const n = its.length;
  const legCap = new Map<string, number>();
  for (const it of its) for (const l of it.legs) if (!legCap.has(l.id)) legCap.set(l.id, l.weeklySeats);
  const legCapacity = new Map(legCap);
  const remaining = new Map(legCap);
  const EPS = 1e-9;

  const util: SegmentMap<number[]> = segmentMap((s) => its.map((it) => itineraryUtility(it, s, p).total));
  const outU: SegmentMap<number> = segmentMap((s) => outsideUtility(s, input.outside, p));

  const open = its.map((it) => it.legs.every((l) => (remaining.get(l.id) ?? 0) > EPS));
  const accepted: SegmentMap<number[]> = segmentMap(() => new Array<number>(n).fill(0));
  const spilledBy = new Array<number>(n).fill(0);
  const recapturedBy = new Array<number>(n).fill(0);
  const unconstrained = new Array<number>(n).fill(0);
  const totals: ChoiceTotals = {
    demand: 0, captured: 0, lostToOutside: 0, lostNotRecaptured: 0, lostNoSeats: 0, unservedSpill: 0,
  };

  /** Allocate requests against remaining leg capacity; returns spill per segment/itinerary. */
  const allocate = (req: SegmentMap<number[]>, isRecapture: boolean): SegmentMap<number[]> => {
    const legReq = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const total = SEGMENTS.reduce((s, g) => s + req[g][i]!, 0);
      if (total <= 0) continue;
      for (const l of its[i]!.legs) legReq.set(l.id, (legReq.get(l.id) ?? 0) + total);
    }
    const legFactor = new Map<string, number>();
    for (const [id, r] of legReq) legFactor.set(id, r <= 0 ? 1 : Math.min(1, (remaining.get(id) ?? 0) / r));
    const spill = segmentMap(() => new Array<number>(n).fill(0));
    const used = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const f = Math.min(...its[i]!.legs.map((l) => legFactor.get(l.id) ?? 1));
      for (const s of SEGMENTS) {
        const r = req[s][i]!;
        if (r <= 0) continue;
        const acc = r * f;
        accepted[s][i]! += acc;
        spill[s][i] = r - acc;
        spilledBy[i]! += r - acc;
        if (isRecapture) recapturedBy[i]! += acc;
        for (const l of its[i]!.legs) used.set(l.id, (used.get(l.id) ?? 0) + acc);
      }
    }
    for (const [id, u] of used) remaining.set(id, Math.max(0, (remaining.get(id) ?? 0) - u));
    for (let i = 0; i < n; i++) {
      if (open[i] && !its[i]!.legs.every((l) => (remaining.get(l.id) ?? 0) > EPS)) open[i] = false;
    }
    return spill;
  };

  // Pass 0: unconstrained logit including the outside option, then capacity.
  const req0 = segmentMap(() => new Array<number>(n).fill(0));
  for (const s of SEGMENTS) {
    const d = input.demand[s];
    totals.demand += d;
    const us = util[s];
    let m = outU[s];
    for (let i = 0; i < n; i++) if (open[i]) m = Math.max(m, us[i]!);
    let denom = Math.exp(outU[s] - m);
    const w = us.map((u, i) => (open[i] ? Math.exp(u - m) : 0));
    for (const x of w) denom += x;
    totals.lostToOutside += (d * Math.exp(outU[s] - m)) / denom;
    for (let i = 0; i < n; i++) {
      req0[s][i] = (d * w[i]!) / denom;
      unconstrained[i]! += req0[s][i]!;
    }
  }
  let spill = allocate(req0, false);
  let passesUsed = 1;

  for (let pass = 0; pass < p.recapturePasses; pass++) {
    const spillTotal = SEGMENTS.reduce((s, g) => s + spill[g].reduce((a, b) => a + b, 0), 0);
    if (spillTotal <= EPS) {
      spill = segmentMap(() => new Array<number>(n).fill(0));
      break;
    }
    const req = segmentMap(() => new Array<number>(n).fill(0));
    for (const s of SEGMENTS) {
      const sp = spill[s].reduce((a, b) => a + b, 0);
      const pool = sp * p.segments[s].recapture;
      totals.lostNotRecaptured += sp - pool;
      if (pool <= 0) continue;
      const us = util[s];
      let m = -Infinity;
      for (let i = 0; i < n; i++) if (open[i]) m = Math.max(m, us[i]!);
      if (m === -Infinity) {
        totals.lostNoSeats += pool;
        continue;
      }
      const w = us.map((u, i) => (open[i] ? Math.exp(u - m) : 0));
      const denom = w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < n; i++) req[s][i] = (pool * w[i]!) / denom;
    }
    spill = allocate(req, true);
    passesUsed++;
  }
  totals.unservedSpill = SEGMENTS.reduce((s, g) => s + spill[g].reduce((a, b) => a + b, 0), 0);

  const results: ItineraryResult[] = its.map((it, i) => {
    const bySegment = segmentMap((s) => accepted[s][i]!);
    const passengers = SEGMENTS.reduce((s, g) => s + bySegment[g], 0);
    totals.captured += passengers;
    return {
      id: it.id,
      bySegment,
      passengers,
      unconstrained: unconstrained[i]!,
      spilled: spilledBy[i]!,
      recaptured: recapturedBy[i]!,
    };
  });

  const legs: ChoiceResult["legs"] = {};
  for (const [id, cap] of legCapacity) {
    const load = cap - (remaining.get(id) ?? 0);
    legs[id] = { capacity: cap, load, loadFactor: cap > 0 ? load / cap : 0 };
  }
  return { itineraries: results, totals, legs, passesUsed };
}
