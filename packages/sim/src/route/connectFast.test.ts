import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Route } from "@arg/contracts";
import { newSim, stepDay } from "../index";
import { benchmarkFareFor } from "../demand/fares";
import { distanceKm } from "../geo";
import { evaluateHubConnection } from "./routeModel";
import { clearFastConnectionCache, fastConnectionDemand, fastConnectionShares } from "./connectFast";
import { isSensibleConnection, NETWORK_LIMITS } from "./network";

const byId = new Map(airports.map((a) => [a.id, a]));
const types = new Map(aircraftTypes.map((t) => [t.id, t]));

/** A hub with `n` spokes to its largest cities 600-9,000 km away (the same build as the calibration in MODEL.md 9c). */
function hubSim(hubId: string, n: number, seed = 1) {
  const hub = byId.get(hubId)!;
  const spokes = airports
    .filter((a) => a.id !== hubId && distanceKm(hub, a) > 600 && distanceKm(hub, a) < 9000)
    .sort((a, b) => b.metroPopulation - a.metroPopulation || a.id.localeCompare(b.id))
    .slice(0, n);
  const routes: Route[] = spokes.map((a, i) => ({
    id: `r${i}`, origin: hubId, destination: a.id, weeklyFrequency: 14,
    fares: { Y: Math.round(benchmarkFareFor(hub, a)) }, typeId: distanceKm(hub, a) > 4000 ? "B777-300ER" : "A321",
  }));
  return { hub, spokes, routes, sim: newSim(seed, airports, aircraftTypes, { notionalFleet: true }, { cash: 1e9, routes, baseAirport: hubId }) };
}

const transferShare = (s: ReturnType<typeof stepDay>) => {
  const reps = Object.values(s.routeReports);
  const conn = reps.reduce((t, r) => t + (r.connecting?.passengersOneWay ?? 0), 0);
  const pax = reps.reduce((t, r) => t + r.evaluation.passengersPerWeek, 0);
  return pax > 0 ? (2 * conn) / pax : 0;
};

describe("fast connecting tier", () => {
  it("is a pure memo: same inputs give the same shares, cached or recomputed, whichever day of the week asks first", () => {
    const [a, hub, b] = ["LHR", "DXB", "BOM"].map((id) => byId.get(id)!);
    const leg = { frequency: 14, speedKmh: 900 };
    const fare = benchmarkFareFor(a!, b!) * 0.92;
    clearFastConnectionCache();
    const first = fastConnectionShares(a!, hub!, b!, leg, leg, fare, 100);
    clearFastConnectionCache();
    // another day of the same refresh week: solved on the same reference day, so identical
    const week = [94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106].map((d) => fastConnectionShares(a!, hub!, b!, leg, leg, fare, d));
    const same = week.filter((x) => JSON.stringify(x) === JSON.stringify(first));
    expect(same.length).toBeGreaterThanOrEqual(7);
    for (const v of Object.values(first)) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
  });

  it("reacts to its inputs: more frequency or a lower fare wins more passengers", () => {
    const [a, hub, b] = ["LHR", "DXB", "BOM"].map((id) => byId.get(id)!);
    const fare = benchmarkFareFor(a!, b!) * 0.92;
    const base = fastConnectionDemand(a!, hub!, b!, { frequency: 7, speedKmh: 900 }, { frequency: 7, speedKmh: 900 }, fare, 50);
    const freq = fastConnectionDemand(a!, hub!, b!, { frequency: 21, speedKmh: 900 }, { frequency: 21, speedKmh: 900 }, fare, 50);
    const cheap = fastConnectionDemand(a!, hub!, b!, { frequency: 7, speedKmh: 900 }, { frequency: 7, speedKmh: 900 }, fare * 0.8, 50);
    expect(base).toBeGreaterThan(0);
    expect(freq).toBeGreaterThan(base);
    expect(cheap).toBeGreaterThan(base);
  });

  it("agrees with the full model in total over many markets (within 25%)", () => {
    const { hub, spokes, routes } = hubSim("DXB", 40);
    let full = 0, fast = 0;
    for (let i = 0; i < 40; i += 3) for (let j = i + 1; j < 40; j += 4) {
      const a = spokes[i]!, b = spokes[j]!;
      if (!isSensibleConnection(a, hub, b)) continue;
      const f = evaluateHubConnection({ origin: a, hub, destination: b, leg1: routes[i]!, leg2: routes[j]!, types, day: 0 });
      if (!f) continue;
      const leg = (r: Route) => ({ frequency: r.weeklyFrequency, speedKmh: types.get(r.typeId)!.cruiseKmh });
      full += f.connectingPassengers;
      fast += fastConnectionDemand(a, hub, b, leg(routes[i]!), leg(routes[j]!), benchmarkFareFor(a, b) * 0.92, 0);
    }
    console.log(`fast/full over the sample: ${(fast / full).toFixed(2)}`);
    expect(full).toBeGreaterThan(0);
    expect(fast / full).toBeGreaterThan(0.75);
    expect(fast / full).toBeLessThan(1.25);
  }, 120_000);
});

describe("connections scale with the hub (no network-wide market cap)", () => {
  it("the share of passengers connecting grows with the number of destinations", () => {
    const small = transferShare(stepDay(hubSim("DXB", 10).sim));
    const large = transferShare(stepDay(hubSim("DXB", 60).sim));
    console.log(`share of boardings connecting: 10 destinations ${(100 * small).toFixed(0)}%, 60 destinations ${(100 * large).toFixed(0)}%`);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(0.25);
  }, 120_000);

  const big = stepDay(hubSim("DXB", 60).sim);

  it("evaluates far more markets than each hub's full-model set", () => {
    const keys = new Set<string>();
    for (const r of Object.values(big.routeReports)) for (const m of r.connecting?.markets ?? []) keys.add(`${m.origin}-${m.destination}`);
    const all = Object.values(big.routeReports).reduce((t, r) => t + (r.connecting?.viaHub?.DXB?.markets ?? 0), 0) / 2;
    expect(all).toBeGreaterThan(5 * NETWORK_LIMITS.fullMarketsPerHub);
    expect(keys.size).toBeLessThanOrEqual(all);
  });

  it("never sells a seat twice on any leg", () => {
    for (const r of Object.values(big.routeReports)) {
      expect(r.evaluation.passengersPerWeek, r.routeId).toBeLessThanOrEqual(r.evaluation.seatsPerWeek + 1e-6);
    }
  });

  it("lists at most the route's largest markets, and per-hub totals cover the listed and unlisted ones exactly", () => {
    let trimmed = 0;
    for (const r of Object.values(big.routeReports)) {
      const c = r.connecting;
      if (!c) continue;
      expect(c.markets.length).toBeLessThanOrEqual(NETWORK_LIMITS.listedMarketsPerRoute);
      const listed = c.markets.reduce((t, m) => t + m.passengersOneWay, 0);
      const via = Object.values(c.viaHub ?? {});
      const viaPax = via.reduce((t, v) => t + v.passengersOneWay, 0);
      const viaCount = via.reduce((t, v) => t + v.markets, 0);
      expect(viaPax).toBeCloseTo(c.passengersOneWay, 3);
      expect(listed + (c.otherMarkets?.passengersOneWay ?? 0)).toBeCloseTo(c.passengersOneWay, 3);
      expect(viaCount).toBe(c.markets.length + (c.otherMarkets?.count ?? 0));
      if (c.otherMarkets) {
        trimmed++;
        const smallestListed = Math.min(...c.markets.map((m) => m.passengersOneWay));
        expect(c.otherMarkets.passengersOneWay / c.otherMarkets.count).toBeLessThanOrEqual(smallestListed + 1e-9);
      }
    }
    expect(trimmed).toBeGreaterThan(0);
  });

  it("is deterministic: the same seed gives identical connecting figures, with or without a warm cache", () => {
    const run = () => { let s = hubSim("DXB", 30).sim; for (let d = 0; d < 10; d++) s = stepDay(s); return Object.values(s.routeReports).map((r) => r.connecting?.passengersOneWay ?? 0); };
    const warm = run();
    clearFastConnectionCache();
    const cold = run();
    expect(cold).toEqual(warm);
  }, 120_000);
});
