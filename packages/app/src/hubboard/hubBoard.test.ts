import { describe, expect, it } from "vitest";
import type { Route } from "@arg/contracts";
import type { RouteReport } from "@arg/sim";
import type { FleetItem } from "../sim/bridge";
import { boardHubOptions, buildBoardRows, buildHourRows, connectingShare, hubTypeIds, summarizeBoard } from "./hubBoard";

const route = (id: string, origin: string, destination: string, typeId = "B737-800", weeklyFrequency = 7): Route =>
  ({ id, origin, destination, typeId, weeklyFrequency, fares: { economy: 100 } }) as unknown as Route;
const report = (profit: number, lf: number, pax: number, connOneWay?: number, scheduled?: number): RouteReport =>
  ({
    evaluation: { profit, loadFactor: lf, passengersPerWeek: pax },
    scheduling: scheduled === undefined ? null : { scheduledFrequency: scheduled },
    connecting: connOneWay === undefined ? undefined : { passengersOneWay: connOneWay },
  }) as unknown as RouteReport;

const routes = [route("a", "LAX", "SFO"), route("b", "SAN", "LAX", "A320", 5), route("c", "LAX", "HNL", "B777-200ER", 3), route("d", "SFO", "SAN")];
const reports: Record<string, RouteReport> = { a: report(1000, 0.8, 1000, 100, 6), b: report(5000, 0.7, 500), c: report(-200, 0.6, 400, 50) };

describe("connectingShare", () => {
  it("counts both directions and clamps", () => {
    expect(connectingShare(100, 1000)).toBeCloseTo(0.2);
    expect(connectingShare(900, 1000)).toBe(1);
    expect(connectingShare(10, 0)).toBe(0);
    expect(connectingShare(0, 100)).toBe(0);
  });
});

describe("buildBoardRows", () => {
  const rows = buildBoardRows(routes, reports, "LAX");
  it("lists only routes touching the hub, departures first then by profit", () => {
    expect(rows.map((r) => r.routeId)).toEqual(["a", "c", "b"]);
    expect(rows.map((r) => r.direction)).toEqual(["dep", "dep", "arr"]);
    expect(rows[2]!.other).toBe("SAN");
  });
  it("uses scheduled frequency and keeps the requested one", () => {
    expect(rows[0]).toMatchObject({ frequency: 6, requested: 7, connectingShare: 0.2 });
    expect(rows[1]).toMatchObject({ frequency: 3, requested: 3 });
  });
  it("marks routes without a report as unavailable and sorts them last", () => {
    const r = buildBoardRows([...routes, route("e", "LAX", "OGG")], reports, "LAX");
    const e = r.find((x) => x.routeId === "e")!;
    expect(e).toMatchObject({ loadFactor: null, weeklyProfit: null, connectingShare: null });
    expect(r.filter((x) => x.direction === "dep").at(-1)!.routeId).toBe("e");
  });
});

describe("summarizeBoard", () => {
  it("sums profit and connecting passengers over reported routes", () => {
    const s = summarizeBoard(routes, reports, "LAX");
    expect(s).toMatchObject({ routes: 3, weeklyProfit: 5800, unreported: 0, connectingPassengers: 300 });
    expect(s.connectingShare).toBeCloseTo(300 / 1900);
  });
  it("is unavailable with no reports", () => {
    const s = summarizeBoard(routes, {}, "LAX");
    expect(s).toMatchObject({ unreported: 3, weeklyProfit: 0, connectingPassengers: null, connectingShare: null });
  });
});

describe("block hours", () => {
  const fleet = [
    { typeId: "A320", status: "active", hub: "LAX" }, { typeId: "A321", status: "delivery", hub: "LAX" },
    { typeId: "B737-800", status: "active", hub: "SFO" }, { typeId: "A319", status: "active" },
  ] as FleetItem[];
  it("lists active types based at the hub plus route types leaving it", () => {
    expect(hubTypeIds(fleet, routes, "LAX")).toEqual(["A320", "B737-800", "B777-200ER"]);
    expect(hubTypeIds(fleet, routes, "LAX", "LAX")).toEqual(["A319", "A320", "B737-800", "B777-200ER"]);
  });
  it("computes used share, capped and zero-safe", () => {
    const table: Record<string, { available: number; used: number; free: number }> = {
      x: { available: 100, used: 25, free: 75 }, y: { available: 0, used: 0, free: 0 }, z: { available: 10, used: 50, free: -40 },
    };
    const rows = buildHourRows(["x", "y", "z"], (t) => table[t]!);
    expect(rows.map((r) => r.usedShare)).toEqual([0.25, 0, 2]);
    expect(rows[2]!.free).toBe(-40);
  });
});

describe("boardHubOptions", () => {
  it("puts home first and adds airports with two or more routes", () => {
    const fleet = [{ hub: "SFO", status: "active", typeId: "x" }] as FleetItem[];
    expect(boardHubOptions(fleet, routes, "LAX")).toEqual(["LAX", "SAN", "SFO"]);
  });
});
