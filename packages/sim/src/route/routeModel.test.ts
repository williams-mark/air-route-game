import { describe, expect, it } from "vitest";
import type { Route } from "@arg/contracts";
import { AIRCRAFT_TYPES, AIRPORTS } from "../testing/fixtures";
import { simulateRouteWeek } from "./routeModel";

const airports = new Map(AIRPORTS.map((a) => [a.id, a]));
const types = new Map(AIRCRAFT_TYPES.map((t) => [t.id, t]));
const route = (o: string, d: string, freq: number, y: number, typeId: string): Route => ({
  id: `${o}${d}`, origin: o, destination: d, weeklyFrequency: freq, fares: { Y: y, J: y * 3.2 }, typeId,
});
const JUL = 195;

describe("route model", () => {
  it("prints realised (post outside-option) market volumes for calibration", () => {
    for (const [o, d, f, y, t] of [["LAX", "SFO", 70, 105, "A321neo"], ["LAX", "HNL", 14, 270, "B787-9"]] as const) {
      const w = simulateRouteWeek(route(o, d, f, y, t), airports, types, 100)!;
      const t0 = w.choice.totals;
      console.log(
        `REALISED ${o}-${d}: potential ${Math.round(w.snapshot.weeklyDemand)}/wk one-way, carried ${Math.round(t0.captured)} (${(
          (100 * t0.captured) / t0.demand
        ).toFixed(0)}%), player ${Math.round(w.playerPassengersOneWay)} (${(100 * w.snapshot.playerShare).toFixed(1)}% share), connecting share ${(
          100 * w.snapshot.connectingShare
        ).toFixed(1)}%, margin ${w.evaluation.margin.toFixed(2)}`,
      );
      expect(w.snapshot.weeklyDemand).toBeGreaterThan(20000);
    }
  });

  it("LAX-HNL daily 787-9 at a reasonable fare is profitable through the full demand chain", () => {
    const w = simulateRouteWeek(route("LAX", "HNL", 7, 270, "B787-9"), airports, types, JUL)!;
    expect(w.evaluation.feasible).toBe(true);
    expect(w.evaluation.profit).toBeGreaterThan(0);
    expect(w.evaluation.loadFactor).toBeGreaterThan(0.7);
  });

  it("a 90-seat jet on LAX-HNL is infeasible, flies nothing and loses money", () => {
    const w = simulateRouteWeek(route("LAX", "HNL", 7, 270, "CRJ900"), airports, types, JUL)!;
    expect(w.evaluation.feasible).toBe(false);
    expect(w.evaluation.profit).toBeLessThan(0);
    expect(w.playerPassengersOneWay).toBe(0);
  });

  it("overpriced route loses share and load factor", () => {
    const lf = (y: number) => simulateRouteWeek(route("LAX", "HNL", 7, y, "B787-9"), airports, types, JUL)!.evaluation.loadFactor;
    expect(lf(600)).toBeLessThan(lf(270));
  });

  it("returns null for unknown airports or types", () => {
    expect(simulateRouteWeek(route("LAX", "XXX", 7, 200, "B787-9"), airports, types, 0)).toBeNull();
    expect(simulateRouteWeek(route("LAX", "SFO", 7, 200, "NOPE"), airports, types, 0)).toBeNull();
  });
});
