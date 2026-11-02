import { describe, expect, it } from "vitest";
import type { Route } from "@arg/contracts";
import { newSim, runDays, stepDay, newWorld } from "./index";
import { AIRCRAFT_TYPES, AIRPORTS, makeAircraft } from "./testing/fixtures";

const laxHnl = (freq = 7, typeId = "B787-9", y = 270): Route => ({
  id: "r1", origin: "LAX", destination: "HNL", weeklyFrequency: freq, fares: { Y: y, J: 900 }, typeId,
});
const laxSfo = (): Route => ({
  id: "r2", origin: "LAX", destination: "SFO", weeklyFrequency: 28, fares: { Y: 105 }, typeId: "B737-800",
});

function simWith(seed: number, routes: Route[], fleetN = 0) {
  const s = newSim(seed, AIRPORTS, AIRCRAFT_TYPES);
  s.world.routes = routes;
  for (let i = 0; i < fleetN; i++) s.world.fleet.push(makeAircraft(`${i}`, "B787-9", 290));
  return s;
}

describe("stepDay", () => {
  it("still advances a bare WorldState without mutating it", () => {
    const w = newWorld(1);
    const n = stepDay(w);
    expect(n.day).toBe(1);
    expect(w.day).toBe(0);
  });

  it("with no routes, only overhead is charged and cash falls", () => {
    const s1 = stepDay(newSim(1, AIRPORTS, AIRCRAFT_TYPES));
    const snap = s1.snapshots[0]!;
    expect(snap.revenue).toBe(0);
    expect(snap.profit).toBeLessThan(0);
    expect(s1.world.cash).toBeCloseTo(100_000_000 + snap.profit, 6);
  });

  it("a route produces a FinanceSnapshot each day and reports for the ledger UI", () => {
    const s = runDays(simWith(7, [laxHnl()]), 10);
    expect(s.snapshots).toHaveLength(10);
    expect(s.world.day).toBe(10);
    expect(s.snapshots[9]!.day).toBe(9);
    expect(s.snapshots.every((x) => x.revenue > 0)).toBe(true);
    const rep = s.routeReports["r1"]!;
    expect(rep.evaluation.lines.length).toBeGreaterThan(8);
    expect(rep.market.playerShare).toBeGreaterThan(0);
    expect(rep.notionalFleet).toBe(true);
    expect(s.events.map((e) => e.kind)).toEqual(["tick", "finance"]);
  });

  it("revenue is smooth and seasonal (Hawaii potential demand: July above late September)", () => {
    const s = simWith(3, [laxHnl(14)]);
    const rev: number[] = [];
    let cur = s;
    for (let d = 0; d < 365; d++) {
      cur = stepDay(cur);
      rev.push(cur.routeReports["r1"]!.market.weeklyDemand);
    }
    const avg = (a: number, b: number) => rev.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
    expect(avg(180, 210)).toBeGreaterThan(avg(255, 285));
    // day to day jumps are bounded
    for (let i = 1; i < rev.length; i++) expect(Math.abs(rev[i]! / rev[i - 1]! - 1)).toBeLessThan(0.12);
  });

  it("owned fleet is charged lease; too few aircraft cut operated frequency", () => {
    const notional = runDays(simWith(5, [laxHnl(14)], 0), 3);
    const owned = runDays(simWith(5, [laxHnl(14)], 1), 3);
    const none = notional.routeReports["r1"]!;
    const rep = owned.routeReports["r1"]!;
    expect(none.operatedFraction).toBe(1);
    expect(rep.operatedFraction).toBeLessThan(1); // 14 round trips/wk needs > 1 787
    expect(rep.evaluation.lines.find((l) => l.key === "ownership")).toBeUndefined();
    expect(rep.evaluation.flightsPerWeek).toBeLessThan(none.evaluation.flightsPerWeek);
  });

  it("an infeasible aircraft type loses money every day", () => {
    const r = laxHnl(7, "CRJ900");
    const s = runDays(simWith(2, [r]), 5);
    expect(s.routeReports["r1"]!.evaluation.feasible).toBe(false);
    expect(s.snapshots.every((x) => x.revenue === 0 && x.profit < 0)).toBe(true);
  });

  it("is deterministic: same seed byte-identical, different seed differs (worked example e)", () => {
    const run = (seed: number) => JSON.stringify(runDays(simWith(seed, [laxHnl(), laxSfo()], 3), 60));
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });

  it("does not mutate the input state", () => {
    const s = simWith(9, [laxHnl()], 1);
    const before = JSON.stringify(s);
    stepDay(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});
