import type { AircraftType, CabinClass, CabinLayout, ServiceLevel } from "@arg/contracts";
import { defaultLayout } from "../fleet/layout";
import { comfortByClass } from "./effects";
import { CABIN_CLASSES, sectionSeats } from "./rules";

/**
 * Passenger experience per cabin. Experience = seat comfort (cabin/effects.ts, 1.0 at benchmark) x the service index of the
 * cabin's service level x (1 - aircraft age penalty). It is measured against the type's reference layout with standard service
 * on a new aircraft, so that cabin is neutral: fare multiplier 1 and score 60. Economy is the market anchor (the choice model
 * prices every route off its economy fare), so its fare multiplier stays 1 and only its score moves.
 *
 * The service index and age figures are game-balance assumptions, not sourced data.
 */
export const EXPERIENCE_PARAMS = {
  /** Service quality index that multiplies comfort. */
  serviceIndex: { basic: 0.92, standard: 1, superior: 1.1 } as Record<ServiceLevel, number>,
  /** Years before an aircraft's age starts to cost passenger experience, and the penalty per year beyond that, capped. */
  ageFreeYears: 5,
  agePenaltyPerYear: 0.01,
  agePenaltyMax: 0.15,
  /** Bounds on the fare multiplier of a premium cabin relative to the reference cabin. */
  fareMin: 0.85,
  fareMax: 1.25,
  /** Experience score of the reference cabin (0..100 scale). */
  referenceScore: 60,
} as const;

export const SERVICE_LEVELS: readonly ServiceLevel[] = ["basic", "standard", "superior"];
export const DEFAULT_SERVICE_LEVEL: ServiceLevel = "standard";
export const SERVICE_LEVEL_NAME: Record<ServiceLevel, string> = { basic: "Basic", standard: "Standard", superior: "Superior" };

/** Penalty on experience for an aircraft of this age (0 for young aircraft, capped). */
export function ageServicePenalty(ageYears: number): number {
  const P = EXPERIENCE_PARAMS;
  return Math.min(P.agePenaltyMax, Math.max(0, ageYears - P.ageFreeYears) * P.agePenaltyPerYear);
}

export interface CabinExperience {
  cls: CabinClass;
  serviceLevel: ServiceLevel;
  /** Raw experience relative to the reference cabin (1.0 = reference). */
  ratio: number;
  /** 0..100, referenceScore for the reference cabin. */
  score: number;
  /** Fare multiplier applied to this cabin's fare (1 for economy). */
  fareMultiplier: number;
}

export type ExperienceProfile = Partial<Record<CabinClass, CabinExperience>>;

const referenceCache = new WeakMap<AircraftType, Partial<Record<CabinClass, number>>>();
/** Comfort of the reference layout per class, cached per type (the reference is the type's default cabin). */
function referenceComfort(type: AircraftType): Partial<Record<CabinClass, number>> {
  let c = referenceCache.get(type);
  if (!c) {
    c = comfortByClass(type, defaultLayout(type));
    referenceCache.set(type, c);
  }
  return c;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Experience of each cabin in `layout` on `type`, for an aircraft of `ageYears` and the airline's service levels (absent = standard).
 * Reference: the type's default layout, standard service, new. A cabin the reference lacks is compared to benchmark comfort (1.0).
 */
const profileCache = new WeakMap<CabinLayout, Map<string, ExperienceProfile>>();
export function experienceProfile(
  type: AircraftType,
  layout: CabinLayout,
  ageYears: number,
  serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>,
): ExperienceProfile {
  const key = levelsKey(type, ageYears, serviceLevels);
  let memo = profileCache.get(layout);
  const hit = memo?.get(key);
  if (hit) return hit;
  const out = computeProfile(type, layout, ageYears, serviceLevels);
  if (!memo) { memo = new Map(); profileCache.set(layout, memo); }
  if (memo.size > 16) memo.clear();
  memo.set(key, out);
  return out;
}

/** Cache key for a type, an age and the airline's service levels (cached results are shared, so callers must not mutate them). */
function levelsKey(type: AircraftType, ageYears: number, serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>): string {
  return `${type.id}|${ageYears}|${serviceLevels?.F ?? ""}${serviceLevels?.J ?? ""}${serviceLevels?.W ?? ""}${serviceLevels?.Y ?? ""}`;
}

function computeProfile(
  type: AircraftType,
  layout: CabinLayout,
  ageYears: number,
  serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>,
): ExperienceProfile {
  const P = EXPERIENCE_PARAMS;
  const comfort = comfortByClass(type, layout);
  const refComfort = referenceComfort(type);
  const age = 1 - ageServicePenalty(ageYears);
  const out: ExperienceProfile = {};
  for (const cls of CABIN_CLASSES) {
    if (!layout.sections.some((s) => s.cls === cls && sectionSeats(s) > 0)) continue;
    const level = serviceLevels?.[cls] ?? DEFAULT_SERVICE_LEVEL;
    const raw = (comfort[cls] ?? 1) * P.serviceIndex[level] * age;
    const refRaw = refComfort[cls] ?? 1;
    const ratio = raw / refRaw;
    const fareMultiplier = cls === "Y" ? 1 : clamp(ratio, P.fareMin, P.fareMax);
    out[cls] = { cls, serviceLevel: level, ratio, score: clamp(Math.round(P.referenceScore * ratio), 0, 100), fareMultiplier };
  }
  return out;
}

/**
 * Fare multiplier per cabin for an aircraft (1 where the cabin has no seats). Called for every cabin of every route each day, so
 * results are memoised per layout object (aircraft keep their layout object between days), keyed by type, age and service levels.
 */
const multiplierCache = new WeakMap<CabinLayout, Map<string, Partial<Record<CabinClass, number>>>>();
export function experienceFareMultipliers(
  type: AircraftType,
  layout: CabinLayout,
  ageYears: number,
  serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>,
): Partial<Record<CabinClass, number>> {
  const key = levelsKey(type, ageYears, serviceLevels);
  let memo = multiplierCache.get(layout);
  const hit = memo?.get(key);
  if (hit) return hit;
  const p = experienceProfile(type, layout, ageYears, serviceLevels);
  const out: Partial<Record<CabinClass, number>> = {};
  for (const cls of CABIN_CLASSES) if (p[cls]) out[cls] = p[cls]!.fareMultiplier;
  if (!memo) { memo = new Map(); multiplierCache.set(layout, memo); }
  if (memo.size > 16) memo.clear();
  memo.set(key, out);
  return out;
}

/** Route-level experience: cabins weighted by the seats they fly (fleet groups weighted by their share of flights). */
export interface RouteExperience {
  /** Seat-weighted score, 0..100 (referenceScore = standard, new reference cabin). 0 when no cabins. */
  score: number;
  /** Per cabin flown: seat-weighted score and fare multiplier, with the service level of the largest group. */
  byCabin: Partial<Record<CabinClass, { score: number; fareMultiplier: number; serviceLevel: ServiceLevel }>>;
}

/** Combine fleet-group profiles. `weight` is the share of seats each group contributes per flight (any positive scale). */
export function combineExperience(parts: readonly { weight: number; seats: Partial<Record<CabinClass, number>>; profile: ExperienceProfile }[]): RouteExperience {
  const acc: Partial<Record<CabinClass, { w: number; score: number; mult: number; level: ServiceLevel; levelW: number }>> = {};
  let w = 0, s = 0;
  for (const part of parts) {
    for (const cls of CABIN_CLASSES) {
      const e = part.profile[cls];
      const seats = part.seats[cls] ?? 0;
      if (!e || seats <= 0 || part.weight <= 0) continue;
      const cw = part.weight * seats;
      const cur = acc[cls] ?? { w: 0, score: 0, mult: 0, level: e.serviceLevel, levelW: 0 };
      cur.w += cw;
      cur.score += cw * e.score;
      cur.mult += cw * e.fareMultiplier;
      if (cw > cur.levelW) { cur.level = e.serviceLevel; cur.levelW = cw; }
      acc[cls] = cur;
      w += cw;
      s += cw * e.score;
    }
  }
  const byCabin: RouteExperience["byCabin"] = {};
  for (const cls of CABIN_CLASSES) {
    const a = acc[cls];
    if (a) byCabin[cls] = { score: a.score / a.w, fareMultiplier: a.mult / a.w, serviceLevel: a.level };
  }
  return { score: w > 0 ? s / w : 0, byCabin };
}
