import { describe, expect, it } from "vitest";
import type { Route } from "@arg/contracts";
import { applyCommand } from "../commands";
import { newSim, stepDay } from "../index";
import { makeSave, parseSave, stringifySave } from "../serialize";
import { AIRCRAFT_TYPES, AIRPORTS } from "../testing/fixtures";
import { fareScaleForTargetLoadFactor, scaleFares, simulateRouteWeek } from "./routeModel";

const airports = new Map(AIRPORTS.map((a) => [a.id, a]));
const types = new Map(AIRCRAFT_TYPES.map((t) => [t.id, t]));
const JUL = 195;
const lax = (fares: Route["fares"] = { Y: 105 }, extra: Partial<Route> = {}): Route => ({
  id: "r2", origin: "LAX", destination: "SFO", weeklyFrequency: 28, fares, typeId: "B737-800", ...extra,
});
const lfAt = (route: Route) => (fares: Route["fares"]) => {
  const w = simulateRouteWeek({ ...route, fares }, airports, types, JUL);
  return w && w.evaluation.feasible ? w.evaluation.loadFactor : null;
};
const solve = (route: Route, target: number) => fareScaleForTargetLoadFactor(route.fares, target, lfAt(route));

describe("fare solver for a target load factor", () => {
  it("converges to the target within 0.5 percentage points on a normal route", () => {
    const route = lax();
    const scale = solve(route, 0.8);
    const solved = simulateRouteWeek({ ...route, fares: scaleFares(route.fares, scale) }, airports, types, JUL)!;
    expect(Math.abs(solved.evaluation.loadFactor - 0.8)).toBeLessThanOrEqual(0.005);
  });

  it("a higher target load factor needs lower economy fares (load factor falls as fares rise)", () => {
    const route = lax();
    const low = scaleFares(route.fares, solve(route, 0.6)).Y;
    const high = scaleFares(route.fares, solve(route, 0.85)).Y;
    expect(high).toBeLessThan(low);
  });

  it("scales premium fares by the same factor as economy", () => {
    const f = scaleFares({ Y: 100, J: 320, F: 500 }, 1.5);
    expect(f).toEqual({ Y: 150, J: 480, F: 750 });
  });
});

describe("weekly fare solve in the sim", () => {
  const withRoutes = (routes: Route[]) => {
    const s = newSim(11, AIRPORTS, AIRCRAFT_TYPES);
    s.world.routes = routes;
    return s;
  };

  it("routes without a target keep their fares through a weekly step", () => {
    const base = lax({ Y: 105 });
    const s = stepDay(withRoutes([base]));
    expect(s.world.routes[0]!.fares).toEqual({ Y: 105 });
  });

  it("a route with a target is re-priced on the weekly step and its fares are written back", () => {
    const s = stepDay(withRoutes([lax({ Y: 105 }, { targetLoadFactor: 0.6 })]));
    expect(s.world.routes[0]!.fares.Y).not.toBe(105);
    expect(s.world.routes[0]!.targetLoadFactor).toBe(0.6);
  });

  it("updateRoute sets and clears the target, and rejects values outside 0.5..0.95", () => {
    const s = withRoutes([lax()]);
    const set = applyCommand(s, { kind: "updateRoute", id: "r2", patch: { targetLoadFactor: 0.75 } });
    expect(set.result.ok).toBe(true);
    expect(set.state.world.routes[0]!.targetLoadFactor).toBe(0.75);
    const cleared = applyCommand(set.state, { kind: "updateRoute", id: "r2", patch: { targetLoadFactor: null } });
    expect(cleared.result.ok).toBe(true);
    expect(cleared.state.world.routes[0]).not.toHaveProperty("targetLoadFactor");
    for (const bad of [0.3, 0.96, Number.NaN]) {
      const r = applyCommand(s, { kind: "updateRoute", id: "r2", patch: { targetLoadFactor: bad } });
      expect(r.result).toMatchObject({ ok: false, error: "invalid_target_load_factor" });
    }
  });

  it("a save from before the field existed loads and steps", () => {
    const s = withRoutes([lax()]);
    const text = stringifySave(makeSave(s, { appVersion: "old", savedAt: "2006-01-01T00:00:00Z" }));
    const parsed = parseSave(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const next = stepDay(parsed.save.state as typeof s);
    expect(next.world.routes[0]!.targetLoadFactor).toBeUndefined();
  });
});
