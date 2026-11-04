import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Aircraft, Route } from "@arg/contracts";
import { defaultLayout, newSim, runDays, startingScenario, stepDay, type SimState } from "../index";
import { previewNewRoute, previewRoutePatch, seasonalRouteProfit } from "./liveModel";
import { fleetGroups, simulateRouteWeek } from "./routeModel";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const ac = (id: string, typeId: string): Aircraft => ({
  id, typeId, tailNumber: `N${id}`, layout: defaultLayout(T.get(typeId)!), status: "active", ageDays: 1000,
  hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 },
});
const route = (id: string, o: string, d: string, freq: number, typeId: string, y = 115): Route => ({ id, origin: o, destination: d, weeklyFrequency: freq, fares: { Y: y }, typeId });

function mini(fleet: Aircraft[], routes: Route[]): SimState {
  return newSim(5, airports, aircraftTypes, { notionalFleet: false }, { cash: 5e8, fleet, routes, airlineName: "T", baseAirport: "LAX" });
}

describe("route preview uses the live model", () => {
  // a1 is based at SFO (fixture hub), so it can fly SFO-SAN and LAX-SFO; the others are based at LAX.
  const owned = [{ ...ac("a1", "B737-800"), hubId: "SFO" }, ac("a2", "B737-800"), ac("a3", "B737-800")];
  const routes = [route("r1", "SFO", "SAN", 25, "A321"), route("r2", "LAX", "SFO", 14, "B737-800", 105), route("r3", "LAX", "SAN", 7, "B737-800", 140)];
  const state = runDays(mini(owned, routes), 40);

  it("an unchanged preview equals the live route profit exactly", () => {
    for (const r of routes) {
      const p = previewRoutePatch(state, r.id, {})!;
      expect(p.source).toBe("live");
      expect(p.proposed.profit).toBe(state.routeReports[r.id]!.evaluation.profit);
      expect(p.current.profit).toBe(state.routeReports[r.id]!.evaluation.profit);
      expect(p.delta.profit).toBe(0);
    }
  });

  it("the model re-run today reproduces the live report (no drift) when nothing else moved", () => {
    expect(Math.abs(previewRoutePatch(state, "r2", {})!.drift)).toBeLessThan(1e-6 * Math.abs(state.routeReports["r2"]!.evaluation.profit) + 1);
  });

  it("a one dollar fare change shows a small delta, not a model gap", () => {
    const live = state.routeReports["r1"]!.evaluation.profit;
    const p = previewRoutePatch(state, "r1", { fares: { Y: 116 } })!;
    expect(p.delta.profit).not.toBe(0);
    expect(Math.abs(p.delta.profit)).toBeLessThan(0.05 * Math.abs(live) + 5_000);
    expect(p.proposed.profit).toBeCloseTo(live + p.delta.profit, 6);
  });

  it("a preview does not change the state", () => {
    const before = JSON.stringify(state);
    previewRoutePatch(state, "r1", { weeklyFrequency: 10, fares: { Y: 90 } });
    seasonalRouteProfit(state, "r1", state.world.day);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("previews a frequency cut with the fleet as it is", () => {
    const p = previewRoutePatch(state, "r2", { weeklyFrequency: 7 })!;
    expect(p.proposed.flightsPerWeek).toBeLessThan(p.current.flightsPerWeek);
  });

  it("previews a route not opened yet on the same network", () => {
    const p = previewNewRoute(state, route("x", "LAX", "SAN", 14, "B737-800"))!;
    expect(p.figures.flightsPerWeek).toBeGreaterThan(0);
  });

  it("seasonal profit comes from the live model and covers 12 months", () => {
    const m = seasonalRouteProfit(state, "r2", state.world.day);
    expect(m).toHaveLength(12);
    expect(m.every((x) => Number.isFinite(x.monthly))).toBe(true);
  });

  it("the starting scenario previews without throwing", () => {
    const s = runDays(startingScenario(airports, aircraftTypes, 2015), 10);
    for (const r of s.world.routes) expect(previewRoutePatch(s, r.id, {})!.delta.profit).toBe(0);
  });
});

describe("substituted aircraft use their own economics", () => {
  const req = T.get("A321")!;
  const route1 = route("r", "SFO", "SAN", 20, "A321");
  const run = (fleet: Aircraft[], flights?: Record<string, number>) =>
    simulateRouteWeek(route1, A, T, 100, { fleetAircraft: fleet, fleetFlights: flights, chargeOwnership: false })!;

  it("seats and costs follow the aircraft that fly, not the requested type", () => {
    const sub = run([ac("s1", "B737-800"), ac("s2", "B737-800")]);
    const asked = run([ac("n1", "A321")]);
    expect(sub.evaluation.seatsPerFlight).toBe(run([ac("s9", "B737-800")]).evaluation.seatsPerFlight);
    expect(sub.evaluation.seatsPerFlight).not.toBe(asked.evaluation.seatsPerFlight);
    // the fuel line must follow the 737-800 burn, which differs from the A321's
    const fuel = (w: ReturnType<typeof run>) => w.evaluation.lines.find((l) => l.key === "fuel")!.weekly / w.evaluation.flightsPerWeek;
    expect(fuel(sub)).not.toBeCloseTo(fuel(asked), 0);
  });

  it("a mixed fleet is weighted by the flights each aircraft operates", () => {
    const a = ac("m1", "B737-800"), b = ac("m2", "A321");
    const seatsOf = (id: string) => run([id === "m1" ? a : b]).evaluation.seatsPerFlight;
    const mixed = run([a, b], { m1: 15, m2: 5 });
    expect(mixed.evaluation.seatsPerFlight).toBeCloseTo(0.75 * seatsOf("m1") + 0.25 * seatsOf("m2"), 6);
    const even = run([a, b], { m1: 10, m2: 10 });
    expect(even.evaluation.seatsPerFlight).toBeCloseTo(0.5 * seatsOf("m1") + 0.5 * seatsOf("m2"), 6);
    expect(mixed.evaluation.flightsPerWeek).toBeCloseTo(2 * 20, 9);
  });

  it("groups aircraft by type and layout", () => {
    const g = fleetGroups(req, [ac("a", "B737-800"), ac("b", "B737-800"), ac("c", "A321")], T, { a: 1, b: 1, c: 2 });
    expect(g).toHaveLength(2);
    expect(g.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12);
  });

  it("a scheduled substitute run records the round trips per aircraft", () => {
    let s = mini([ac("s1", "B737-800"), ac("s2", "B737-800")], [route("r", "SFO", "SAN", 25, "A321")]);
    s = stepDay(s);
    const sch = s.routeReports["r"]!.scheduling!;
    expect(sch.substitutedFrequency).toBe(sch.scheduledFrequency);
    expect(Object.values(sch.roundTripsByAircraft!).reduce((x, y) => x + y, 0)).toBe(sch.scheduledFrequency);
  });
});
