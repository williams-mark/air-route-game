import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Route } from "@arg/contracts";
import {
  DEFAULT_ROUTE_MODEL_CONFIG, distanceKm, evaluateHubConnection, networkContribution, simulateRouteWeek,
} from "../index";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const san = A.get("SAN")!, lax = A.get("LAX")!, hnl = A.get("HNL")!;
const legSan: Route = { id: "r-san", origin: "LAX", destination: "SAN", weeklyFrequency: 28, fares: { Y: 80 }, typeId: "A320" };
const legHnl: Route = { id: "r-hnl", origin: "LAX", destination: "HNL", weeklyFrequency: 14, fares: { Y: 270, J: 860 }, typeId: "B777-200ER" };
const DAY = 100;
const hub = (over: Partial<Parameters<typeof evaluateHubConnection>[0]> = {}) =>
  evaluateHubConnection({ origin: san, hub: lax, destination: hnl, leg1: legSan, leg2: legHnl, types: T, day: DAY, ...over })!;

describe("hub connections (SAN-HNL via LAX)", () => {
  it("carries through passengers and counts them in both legs' loads", () => {
    const c = hub();
    expect(c).not.toBeNull();
    expect(c.connectingPassengers).toBeGreaterThan(10);
    const [l1, l2] = c.legs;
    expect(l1.connectingPassengers).toBe(c.connectingPassengers);
    expect(l2.connectingPassengers).toBe(c.connectingPassengers);
    // each leg's load factor includes its local passengers plus the through passengers
    expect(l1.loadFactor).toBeCloseTo((l1.localPassengers + c.connectingPassengers) / l1.seats, 9);
    expect(l2.loadFactor).toBeCloseTo((l2.localPassengers + c.connectingPassengers) / l2.seats, 9);
    const localOnlyLf = simulateRouteWeek(legHnl, A, T, DAY, { chargeOwnership: true })!.evaluation.loadFactor;
    expect(l2.loadFactor).toBeGreaterThan(localOnlyLf);
    expect(l1.loadFactor).toBeLessThanOrEqual(1 + 1e-9);
    expect(l2.loadFactor).toBeLessThanOrEqual(1 + 1e-9);
    expect(c.snapshot.playerShare).toBeGreaterThan(0);
  });

  it("is limited by the seats left on the scarcer leg (capacity sharing)", () => {
    const full = hub();
    const thin = hub({ leg2: { ...legHnl, weeklyFrequency: 4 } });
    expect(thin.connectingPassengers).toBeLessThan(full.connectingPassengers);
    const left2 = thin.legs[1].seats - thin.legs[1].localPassengers;
    expect(thin.connectingPassengers).toBeLessThanOrEqual(left2 + 1e-6);
    // no seats left at all on leg 1 -> no connecting passengers
    expect(hub({ operatedFraction1: 0 }).connectingPassengers).toBe(0);
  });

  it("applies the connection penalty: a heavier penalty and fewer flights both reduce the through share", () => {
    const base = hub().connectingPassengers;
    const noPenalty = hub({
      config: { ...DEFAULT_ROUTE_MODEL_CONFIG, choice: { ...DEFAULT_ROUTE_MODEL_CONFIG.choice, connectPenaltyMin: 0, misconnectBase: 0, misconnectTightExtra: 0 } },
    }).connectingPassengers;
    const harsh = hub({
      config: { ...DEFAULT_ROUTE_MODEL_CONFIG, choice: { ...DEFAULT_ROUTE_MODEL_CONFIG.choice, connectPenaltyMin: 240 } },
    }).connectingPassengers;
    expect(noPenalty).toBeGreaterThan(base);
    expect(harsh).toBeLessThan(base);
  });

  it("returns null when the routes do not match the airports", () => {
    expect(evaluateHubConnection({ origin: san, hub: lax, destination: hnl, leg1: legHnl, leg2: legHnl, types: T, day: DAY })).toBeNull();
  });
});

describe("network contribution report", () => {
  it("prorates the through fare by distance and adds back to the through revenue", () => {
    const c = hub({ connectingFare: 300 });
    const rep = networkContribution(c);
    const d1 = distanceKm(san, lax), d2 = distanceKm(lax, hnl);
    expect(c.leg1ProrateShare).toBeCloseTo(d1 / (d1 + d2), 9);
    expect(rep.throughRevenue).toBeCloseTo(2 * c.connectingPassengers * 300, 6);
    const [r1, r2] = rep.legs;
    expect(r1!.connectingRevenue).toBeCloseTo(rep.throughRevenue * (d1 / (d1 + d2)), 6);
    expect(r2!.connectingRevenue).toBeCloseTo(rep.throughRevenue * (d2 / (d1 + d2)), 6);
    expect(rep.proratedTotal).toBeCloseTo(rep.throughRevenue, 6);
    expect(r2!.connectingRevenue).toBeGreaterThan(r1!.connectingRevenue * 10); // the long leg earns the bulk
    expect(r1!.revenue).toBeCloseTo(r1!.localRevenue + r1!.connectingRevenue, 6);
    expect(r1!.profit).toBeCloseTo(r1!.revenue - r1!.costs, 6);
    // carrying through passengers raises leg costs above the local-only costs
    const localOnly = simulateRouteWeek(legHnl, A, T, DAY, { chargeOwnership: true })!.evaluation.costs;
    expect(r2!.costs).toBeGreaterThan(localOnly * 0.99);
  });
});
