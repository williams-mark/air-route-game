import type { Aircraft, AircraftType, Day } from "@arg/contracts";
import type { AircraftMeta, CheckKind } from "../state";

/**
 * Check programme. Intervals and downtime follow the usual airline pattern (A about 500 flight hours,
 * B about 6 months, C 18-24 months, D 6-10 years). The USD costs are planning ESTIMATES, scaled by list price
 * relative to a reference narrowbody (100M) or widebody (270M); they are not sourced figures.
 */
export const MAINTENANCE_PARAMS = {
  aCheckHours: 500,
  bCheckDays: 180,
  cCheckDays: [540, 720] as const,
  dCheckDays: [2190, 3650] as const,
  /** Days out of service. The A check is done overnight, so it costs money but no flying. */
  downtimeDays: { A: 0, B: 3, C: 21, D: 60 } as Record<CheckKind, number>,
  baseCostUsd: {
    narrow: { A: 12_000, B: 40_000, C: 900_000, D: 3_500_000 },
    wide: { A: 28_000, B: 90_000, C: 2_400_000, D: 9_000_000 },
  } as Record<"narrow" | "wide", Record<CheckKind, number>>,
  referenceListPriceUsdM: { narrow: 100, wide: 270 },
  /** A B/C/D check that is due is deferred (if the schedule would lose flights) for at most this many days. */
  graceDays: 30,
} as const;

export const CHECK_ORDER: readonly CheckKind[] = ["D", "C", "B", "A"];

export function checkCostUsd(type: AircraftType, kind: CheckKind): number {
  const k = type.widebody ? "wide" : "narrow";
  const scale = Math.max(0.5, Math.min(1.8, type.listPriceUsdM / MAINTENANCE_PARAMS.referenceListPriceUsdM[k]));
  return MAINTENANCE_PARAMS.baseCostUsd[k][kind] * scale;
}

/** Checks a heavier check also resets. */
export function checksCoveredBy(kind: CheckKind): CheckKind[] {
  return CHECK_ORDER.slice(CHECK_ORDER.indexOf(kind));
}

function between(rng: () => number, [lo, hi]: readonly [number, number]): number {
  return Math.round(lo + (hi - lo) * rng());
}

/**
 * Meta for an aircraft already in the fleet. Time since each check is staggered by the rng, never more than the
 * aircraft's age, so a starting fleet does not hit every C check on the same day.
 */
export function initialMeta(ac: Aircraft, rng: () => number): AircraftMeta {
  const P = MAINTENANCE_PARAMS;
  const intervals = {
    A: P.aCheckHours,
    B: P.bCheckDays,
    C: between(rng, P.cCheckDays),
    D: between(rng, P.dCheckDays),
  };
  const age = Math.max(0, ac.ageDays);
  const since = (interval: number) => Math.min(age, Math.floor(rng() * interval * 0.95));
  const fresh = ac.status === "delivery";
  return {
    flightHours: age * 8,
    cycles: age * 4,
    daysSince: fresh ? { A: 0, B: 0, C: 0, D: 0 } : { A: 0, B: since(intervals.B), C: since(intervals.C), D: since(intervals.D) },
    intervals,
    maintenance: null,
    deliveryDay: null,
    orderId: null,
    deferredDays: 0,
  };
}

/** The heaviest check that is due now, or null. */
export function dueCheck(ac: Aircraft, meta: AircraftMeta): CheckKind | null {
  for (const k of CHECK_ORDER) {
    if (k === "A") {
      if (ac.hoursSinceCheck.A >= meta.intervals.A) return "A";
    } else if (meta.daysSince[k] >= meta.intervals[k]) return k;
  }
  return null;
}

/** Reset counters for the check just done and every lighter one. */
export function resetAfterCheck(ac: Aircraft, meta: AircraftMeta, kind: CheckKind): void {
  for (const k of checksCoveredBy(kind)) {
    ac.hoursSinceCheck[k] = 0;
    meta.daysSince[k] = 0;
  }
}

export function checkEndDay(kind: CheckKind, day: Day): Day {
  return day + MAINTENANCE_PARAMS.downtimeDays[kind];
}
