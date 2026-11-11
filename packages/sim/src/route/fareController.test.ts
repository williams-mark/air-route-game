import { describe, expect, it } from "vitest";
import type { Aircraft, Route } from "@arg/contracts";
import { newSim, stepDay, type SimState } from "../index";
import { AIRCRAFT_TYPES, AIRPORTS, makeAircraft } from "../testing/fixtures";
import { controlledFareScale, FARE_SOLVER_PARAMS } from "./routeModel";
import { evaluateLiveRoutes } from "./liveModel";

const airports = new Map(AIRPORTS.map((a) => [a.id, a]));
const types = new Map(AIRCRAFT_TYPES.map((t) => [t.id, t]));
/** A day (mid-April) where seasonal demand is close to its annual mean, so a constant-demand check is not offset by the part of the seasonal swing the solve ignores. */
const SETTLE_DAY = 105;
const cap = FARE_SOLVER_PARAMS.maxWeeklyChange;

const fleetOf = (typeId: string, n: number): Aircraft[] =>
  Array.from({ length: n }, (_, i) => ({ ...makeAircraft(`${typeId}-${i}`, typeId, 180), hubId: "LAX" }));
const route = (dest: string, typeId: string, freq: number, target = 0.85): Route =>
  ({ id: "r1", origin: "LAX", destination: dest, weeklyFrequency: freq, fares: { Y: 150 }, typeId, targetLoadFactor: target });

/** One weekly solve at a fixed day with a demand factor; returns the new route and its reported load factor. */
function weeklyStep(r: Route, fleet: Aircraft[], noise: number, day = SETTLE_DAY, solveFares = true) {
  const live = evaluateLiveRoutes({
    routes: [r], fleet, airports, types, day, notionalFleet: false, rivals: null, prefs: undefined, homeHub: "LAX",
    noise: () => noise, solveFares,
  });
  const fares = live.solvedFares[r.id] ?? r.fares;
  return { route: { ...r, fares }, lf: live.reports[r.id]!.evaluation.loadFactor };
}

function run(seed: number, r: Route, fleet: Aircraft[], days: number, noise = 0.03) {
  let s: SimState = newSim(seed, AIRPORTS, AIRCRAFT_TYPES, { notionalFleet: false, demandNoise: noise }, { fleet, routes: [r], cash: 1e10 });
  const fares: number[] = [];
  const lfs: number[] = [];
  for (let d = 0; d < days; d++) {
    s = stepDay(s);
    fares.push(s.world.routes[0]!.fares.Y);
    lfs.push(s.routeReports["r1"]?.evaluation.loadFactor ?? NaN);
  }
  return { fares, lfs };
}

describe("controlledFareScale", () => {
  it("closes a damped part of the gap, never more than the weekly cap, and holds inside the deadband", () => {
    expect(controlledFareScale(1.002)).toBe(1);
    expect(controlledFareScale(1.05)).toBeCloseTo(Math.exp(Math.log(1.05) * FARE_SOLVER_PARAMS.gain), 10);
    expect(controlledFareScale(3)).toBeCloseTo(1 + cap, 10);
    expect(controlledFareScale(0.2)).toBeCloseTo(1 / (1 + cap), 10);
  });
});

describe("weekly fare controller", () => {
  const fleet = fleetOf("B737-800", 6);

  it("converges to the target within a few weeks after a step in demand per seat, never moving more than the cap", () => {
    // The solve prices for expected demand, so the step is a real one: capacity (weekly frequency) changes under a settled fare,
    // which moves demand per seat by the same factor (28 to 18 and 28 to 40 move load factor by 4+ points at the old fare).
    let r = route("SFO", "B737-800", 28);
    for (let w = 0; w < 12; w++) r = weeklyStep(r, fleet, 1).route; // settle
    expect(Math.abs(weeklyStep(r, fleet, 1).lf - 0.85)).toBeLessThanOrEqual(0.005);
    for (const freq of [18, 40]) {
      let cur: Route = { ...r, weeklyFrequency: freq };
      expect(Math.abs(weeklyStep(cur, fleet, 1, SETTLE_DAY, false).lf - 0.85)).toBeGreaterThan(0.03); // a real step
      const lfs: number[] = [];
      for (let w = 0; w < 8; w++) {
        const next = weeklyStep(cur, fleet, 1);
        expect(Math.abs(next.route.fares.Y / cur.fares.Y - 1)).toBeLessThanOrEqual(cap + 1e-9);
        cur = next.route;
        lfs.push(weeklyStep(cur, fleet, 1).lf);
      }
      expect(Math.abs(lfs[4]! - 0.85)).toBeLessThanOrEqual(0.01); // within 1 point after 5 weeks, and it stays there
      expect(Math.abs(lfs[7]! - 0.85)).toBeLessThanOrEqual(0.01);
    }
  });

  it("settles on the target (within 1 point) at constant demand, from a far-off starting fare", () => {
    for (const start of [90, 250]) {
      let r: Route = { ...route("SFO", "B737-800", 28), fares: { Y: start } };
      for (let w = 0; w < 20; w++) r = weeklyStep(r, fleet, 1).route;
      expect(Math.abs(weeklyStep(r, fleet, 1).lf - 0.85)).toBeLessThanOrEqual(0.01);
    }
  });

  it("is smooth under seasonal demand and noise: weekly moves capped, quarter-to-quarter fare change at most 22%", () => {
    const hnl = run(11, route("HNL", "B787-9", 14), fleetOf("B787-9", 10), 365 * 2);
    const sfo = run(11, route("SFO", "B737-800", 35), fleetOf("B737-800", 10), 365 * 2);
    for (const { fares } of [hnl, sfo]) {
      for (let d = 7; d < fares.length; d += 7) {
        const weekly = fares[d]! / fares[d - 7]! - 1;
        expect(Math.abs(weekly)).toBeLessThanOrEqual(cap + 1e-9);
      }
      for (let d = 91 + 60; d < fares.length; d += 91) expect(Math.abs(fares[d]! / fares[d - 91]! - 1)).toBeLessThanOrEqual(0.22);
    }
  });

  it("keeps the average load factor within 1.5 points of the target over a year", () => {
    const { lfs } = run(11, route("SFO", "B737-800", 35), fleetOf("B737-800", 10), 365 * 2);
    const year = lfs.slice(365 - 1 + 60 - 60 + 0).slice(0, 365); // second year, after settling
    const mean = year.reduce((s, x) => s + x, 0) / year.length;
    expect(Math.abs(mean - 0.85)).toBeLessThanOrEqual(0.015);
  });

  it("is deterministic: the same seed gives byte-identical fares", () => {
    const a = run(7, route("HNL", "B787-9", 14), fleetOf("B787-9", 10), 200);
    const b = run(7, route("HNL", "B787-9", 14), fleetOf("B787-9", 10), 200);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = run(8, route("HNL", "B787-9", 14), fleetOf("B787-9", 10), 200);
    expect(c.fares).toEqual(a.fares); // fares are solved for expected demand, so day-to-day demand noise (seed) does not move them
    expect(c.lfs).not.toEqual(a.lfs); // while the reported load factor does carry the noise
  });
});
