import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Route } from "@arg/contracts";
import { newSim, runDays, startingScenario, stepDay } from "../index";
import { CONNECTING_FLOOR, onwardConnectionStatus } from "./network";

const byId = new Map(airports.map((a) => [a.id, a]));
const route = (id: string, o: string, d: string, f: number, typeId: string, y: number): Route => ({ id, origin: o, destination: d, weeklyFrequency: f, fares: { Y: y }, typeId });
const sim = (routes: Route[], seed = 1) => newSim(seed, airports, aircraftTypes, { notionalFleet: true }, { cash: 1e8, routes });
const wide = (d: string) => d === "HNL" || d === "OGG";
const onwardFromLax = (dests: string[], freq = 28) => dests.map((d, i) => route(`r${i}`, "LAX", d, freq, wide(d) ? "B767-300ER" : "A320", wide(d) ? 270 : 110));
/** MRY-LAX plus eight busy routes out of LAX: 28 larger through markets fill the network-wide cut of 12. */
const bigHub = () => [route("m", "MRY", "LAX", 14, "A320", 120), ...onwardFromLax(["SFO", "SAN", "LAS", "SEA", "PHX", "SMF", "HNL", "OGG"])];

describe("connecting floor", () => {
  it("a small spoke into a busy hub carries connecting passengers (was exactly 0: all its markets fell outside the 12 largest)", () => {
    const s = stepDay(sim(bigHub()));
    const m = s.routeReports["m"]!;
    expect(m.connecting).toBeDefined();
    console.log(`MRY-LAX connecting ${m.connecting!.passengersOneWay.toFixed(0)}/wk each way (floor part ${(m.connecting!.floorOneWay ?? 0).toFixed(0)}), LF ${(100 * m.evaluation.loadFactor).toFixed(0)}%: ${m.connecting!.markets.map((x) => `${x.origin}-${x.destination} ${x.passengersOneWay.toFixed(0)}`).join(", ")}`);
    expect(m.connecting!.passengersOneWay).toBeGreaterThan(10);
    expect(m.connecting!.markets.every((x) => x.origin === "MRY" || x.destination === "MRY")).toBe(true);
    expect(m.connecting!.revenue).toBeGreaterThan(0);
    expect(m.evaluation.lines.some((l) => l.key === "connecting")).toBe(true);
  });

  it("every route with an onward connection carries at least the floor, and seats are never oversold", () => {
    const s = stepDay(sim(bigHub()));
    for (const r of Object.values(s.routeReports)) {
      const c = r.connecting;
      expect(c?.passengersOneWay ?? 0, r.routeId).toBeGreaterThanOrEqual(CONNECTING_FLOOR.minPassengersOneWay - 1e-9);
      const local = r.evaluation.passengersPerWeek / 2 - c!.passengersOneWay;
      // every route here has at least one sensible onward city
      expect(c!.passengersOneWay, r.routeId).toBeGreaterThanOrEqual(CONNECTING_FLOOR.sharePerOnwardRoute * local - 1e-6);
      expect(r.evaluation.passengersPerWeek, r.routeId).toBeLessThanOrEqual(r.evaluation.seatsPerWeek + 1e-6);
    }
  });

  it("a full flight still carries the floor: connecting passengers take seats from local ones, and the ledger adds up", () => {
    // LAX-SEA at a very low fare fills with local passengers (100% before connections).
    const s = stepDay(sim([route("m", "MRY", "LAX", 14, "A320", 120), route("s", "LAX", "SEA", 7, "A320", 40)]));
    const sea = s.routeReports["s"]!;
    expect(sea.evaluation.loadFactor).toBeCloseTo(1, 6);
    expect(sea.connecting!.passengersOneWay).toBeGreaterThanOrEqual(CONNECTING_FLOOR.minPassengersOneWay - 1e-9);
    expect(sea.connecting!.displacedOneWay ?? 0).toBeGreaterThan(0);
    expect(sea.evaluation.passengersPerWeek).toBeLessThanOrEqual(sea.evaluation.seatsPerWeek + 1e-6);
    const revenueLines = sea.evaluation.lines.filter((l) => l.group === "revenue").reduce((t, l) => t + l.weekly, 0);
    expect(revenueLines).toBeCloseTo(sea.evaluation.revenue, 4);
  });

  it("the floor scales with the onward network", () => {
    const one = stepDay(sim([route("m", "MRY", "LAX", 14, "A320", 120), route("s", "LAX", "SEA", 7, "A320", 40)])).routeReports["s"]!;
    const many = stepDay(sim([
      route("s", "LAX", "SEA", 7, "A320", 40),
      ...["MRY", "SMF", "SAN", "PHX", "LAS"].map((o, i) => route(`f${i}`, o, "LAX", 14, "A320", 120)),
    ])).routeReports["s"]!;
    expect(many.connecting!.passengersOneWay).toBeGreaterThan(one.connecting!.passengersOneWay);
  });

  it("through revenue is still prorated without loss when the floor adds passengers", () => {
    const s = stepDay(sim(bigHub()));
    const markets = new Set(Object.values(s.routeReports).flatMap((r) => r.connecting?.markets ?? []));
    const through = [...markets].reduce((t, m) => t + m.revenue, 0);
    const booked = Object.values(s.routeReports).reduce((t, r) => t + (r.connecting?.revenue ?? 0), 0);
    expect(booked).toBeCloseTo(through, 4);
    for (const r of Object.values(s.routeReports)) {
      expect(r.connecting!.markets.reduce((t, m) => t + m.passengersOneWay, 0), r.routeId).toBeCloseTo(r.connecting!.passengersOneWay, 6);
    }
  });

  it("no connection, no connecting passengers: a lone route, and a triangle where every pair has a nonstop", () => {
    const lone = stepDay(sim([route("m", "MRY", "LAX", 14, "A320", 120)]));
    expect(lone.routeReports["m"]!.connecting).toBeUndefined();
    expect(onwardConnectionStatus(lone.world.routes[0]!, lone.world.routes, byId)).toBe("none");
    const tri = stepDay(sim([route("a", "LAX", "SFO", 28, "A320", 110), route("b", "LAX", "SAN", 28, "A320", 90), route("c", "SFO", "SAN", 14, "A320", 110)]));
    for (const r of Object.values(tri.routeReports)) expect(r.connecting, r.routeId).toBeUndefined();
    expect(onwardConnectionStatus(tri.world.routes[0]!, tri.world.routes, byId)).toBe("all_nonstop");
    const hub = sim(bigHub());
    expect(onwardConnectionStatus(hub.world.routes[0]!, hub.world.routes, byId)).toBe("available");
  });

  it("is a minimum, not a target: the starting network needs no top-up, and a connection that doubles back gets none", () => {
    const s = runDays(startingScenario(airports, aircraftTypes, 2015), 30);
    for (const r of Object.values(s.routeReports)) {
      expect(r.connecting?.floorOneWay, r.routeId).toBeUndefined();
      expect(r.connecting?.displacedOneWay, r.routeId).toBeUndefined();
    }
    // LAX-HNL and LAX-OGG alone: HNL-OGG via LAX doubles back across the Pacific, so there is no floor and the status says why.
    const back = stepDay(sim([route("h", "LAX", "HNL", 14, "B767-300ER", 270), route("o", "LAX", "OGG", 7, "B767-300ER", 270)]));
    expect(back.routeReports["h"]!.connecting?.floorOneWay).toBeUndefined();
    expect(onwardConnectionStatus(back.world.routes[0]!, back.world.routes, byId)).toBe("backtrack_only");
  });

  it("is deterministic: the same seed gives identical connecting figures over 60 days, with or without the floor in play", () => {
    const a = runDays(sim(bigHub(), 7), 60);
    const b = runDays(sim(bigHub(), 7), 60);
    expect(JSON.stringify(a.routeReports)).toBe(JSON.stringify(b.routeReports));
    expect(a.snapshots.map((x) => x.revenue)).toEqual(b.snapshots.map((x) => x.revenue));
    for (const r of Object.values(a.routeReports)) expect(r.connecting?.passengersOneWay ?? 0, r.routeId).toBeGreaterThan(0);
  });
});
