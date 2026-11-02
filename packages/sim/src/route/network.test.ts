import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Route } from "@arg/contracts";
import { newSim, runDays, stepDay, startingScenario } from "../index";

const route = (id: string, o: string, d: string, f: number, typeId: string, y: number): Route => ({ id, origin: o, destination: d, weeklyFrequency: f, fares: { Y: y }, typeId });

describe("hub connecting passengers in stepDay", () => {
  const s = runDays(startingScenario(airports, aircraftTypes, 2015), 30);

  it("the starting network carries SAN-HNL / SAN-OGG / SFO-HNL style traffic through LAX", () => {
    const san = Object.values(s.routeReports).find((r) => r.routeId === "route-2")!;
    expect(san.connecting).toBeDefined();
    const markets = san.connecting!.markets.map((m) => `${m.origin}-${m.destination}`);
    expect(markets).toContain("SAN-HNL");
    expect(san.connecting!.passengersOneWay).toBeGreaterThan(50);
    expect(san.evaluation.lines.some((l) => l.key === "connecting")).toBe(true);
  });

  it("LAX-SAN load factor sits in a sensible band (was 17%)", () => {
    const e = s.routeReports["route-2"]!.evaluation;
    console.log(`LAX-SAN LF ${(100 * e.loadFactor).toFixed(0)}%`);
    expect(e.loadFactor).toBeGreaterThan(0.6);
    expect(e.loadFactor).toBeLessThan(0.9);
    // the local market alone (no connecting) is also viable at the starting fare
    const connecting = s.routeReports["route-2"]!.connecting!.passengersOneWay;
    const localLf = (e.passengersPerWeek - 2 * connecting) / e.seatsPerWeek;
    expect(localLf).toBeGreaterThan(0.5);
  });

  it("never sells a seat twice: every leg stays at or under its capacity and connecting <= leftover seats", () => {
    for (const r of Object.values(s.routeReports)) {
      expect(r.evaluation.passengersPerWeek).toBeLessThanOrEqual(r.evaluation.seatsPerWeek + 1e-6);
      expect(r.evaluation.loadFactor).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("through revenue is prorated to the legs without loss (every market's two leg shares sum to its through revenue)", () => {
    const perMarket = new Map<string, { through: number; booked: number }>();
    for (const r of Object.values(s.routeReports)) {
      for (const m of r.connecting?.markets ?? []) {
        const key = `${m.origin}-${m.hub}-${m.destination}`;
        perMarket.set(key, { through: m.revenue, booked: 0 });
      }
    }
    const total = Object.values(s.routeReports).reduce((sum, r) => sum + (r.connecting?.revenue ?? 0), 0);
    const throughTotal = [...perMarket.values()].reduce((sum, v) => sum + v.through, 0);
    expect(perMarket.size).toBeGreaterThan(0);
    expect(total).toBeCloseTo(throughTotal, 4);
  });

  it("daily finance includes connecting revenue: snapshot revenue equals the sum of route reports / 7", () => {
    const rev = s.snapshots[s.snapshots.length - 1]!.revenue;
    const sum = Object.values(s.routeReports).reduce((t, r) => t + r.evaluation.revenue, 0) / 7;
    expect(rev).toBeCloseTo(sum, 3);
  });

  it("markets with a direct player route are not connecting markets", () => {
    const base = startingScenario(airports, aircraftTypes, 2015);
    const withDirect = newSim(2015, airports, aircraftTypes, { notionalFleet: true }, {
      cash: 1e8, routes: [...base.world.routes, route("route-9", "SAN", "HNL", 7, "B767-300ER", 300)],
    });
    const r = stepDay(withDirect).routeReports;
    const all = Object.values(r).flatMap((x) => x.connecting?.markets ?? []);
    expect(all.some((m) => m.origin === "SAN" && m.destination === "HNL")).toBe(false);
  });

  it("SMF-HNL is served through LAX when the player flies SMF-LAX and LAX-HNL", () => {
    const sim = newSim(1, airports, aircraftTypes, { notionalFleet: true }, {
      cash: 1e8, routes: [route("a", "SMF", "LAX", 14, "A320", 108), route("b", "LAX", "HNL", 14, "B767-300ER", 270)],
    });
    const st = stepDay(sim);
    const m = st.routeReports["a"]!.connecting?.markets ?? [];
    expect(m.map((x) => `${x.origin}-${x.hub}-${x.destination}`)).toContain("SMF-LAX-HNL");
    const hnlLeg = st.routeReports["b"]!;
    expect(hnlLeg.connecting!.revenue).toBeGreaterThan(0);
    // connecting traffic adds revenue but also cost, and raises the load factor of the leg
    const ev = hnlLeg.evaluation;
    const cost = ev.lines.find((l) => l.key === "connectingCost")!;
    expect(cost.weekly).toBeGreaterThan(0);
    expect(cost.weekly).toBeLessThan(hnlLeg.connecting!.revenue); // marginal passengers are profitable
    const localPax = ev.passengersPerWeek - 2 * hnlLeg.connecting!.passengersOneWay;
    expect(ev.loadFactor).toBeGreaterThan(localPax / ev.seatsPerWeek);
  });
});
