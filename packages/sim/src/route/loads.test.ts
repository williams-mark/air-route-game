import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { runDays, startingScenario, type RouteEvaluation } from "../index";
import { connectingShare, loadByCabin, cabinsFlown } from "./loads";
import { mergeEvaluations } from "../finance/ledger";

describe("route reporting: cabin load factor", () => {
  const evalWith = (cabinLoads: RouteEvaluation["cabinLoads"]) => ({ cabinLoads } as Pick<RouteEvaluation, "cabinLoads">);

  it("an empty business cabin shows 0%, not nothing", () => {
    const l = loadByCabin(evalWith([
      { cls: "J", seatsPerWeek: 400, passengersPerWeek: 0 },
      { cls: "Y", seatsPerWeek: 2000, passengersPerWeek: 1500 },
    ]));
    expect(l.J.loadFactor).toBe(0);
    expect(l.J.seatsPerWeek).toBe(400);
    expect(l.Y.loadFactor).toBeCloseTo(0.75, 9);
  });

  it("a cabin the route does not fly is null, distinct from an empty one", () => {
    const l = loadByCabin(evalWith([{ cls: "Y", seatsPerWeek: 100, passengersPerWeek: 50 }]));
    expect(l.F.loadFactor).toBeNull();
    expect(l.F.seatsPerWeek).toBe(0);
    expect(cabinsFlown(evalWith([{ cls: "Y", seatsPerWeek: 100, passengersPerWeek: 50 }]))).toEqual(["Y"]);
  });

  it("older reports without per-cabin figures show every cabin as null", () => {
    const l = loadByCabin({});
    for (const c of ["F", "J", "W", "Y"] as const) expect(l[c].loadFactor).toBeNull();
  });

  it("merged mixed-fleet evaluations add cabin seats and passengers", () => {
    const a = { cabinLoads: [{ cls: "Y" as const, seatsPerWeek: 100, passengersPerWeek: 60 }] } as RouteEvaluation;
    const b = { cabinLoads: [{ cls: "Y" as const, seatsPerWeek: 50, passengersPerWeek: 10 }, { cls: "J" as const, seatsPerWeek: 20, passengersPerWeek: 0 }] } as RouteEvaluation;
    const base = { feasible: true, flightsPerWeek: 1, seatsPerWeek: 0, passengersPerWeek: 0, lines: [], revenue: 0, costs: 0, profit: 0, margin: 0, revenuePerPassenger: 0, costPerPassenger: 0, breakEvenLoadFactor: null, loadFactor: 0, infeasibleReasons: [], distanceKm: 1, blockHours: 1, seatsPerFlight: 1, fuelUsdPerGallon: 1, aircraftEquivalent: 1, aircraftNeeded: 1 };
    const m = mergeEvaluations([{ ...base, ...a }, { ...base, ...b }] as RouteEvaluation[]);
    const y = m.cabinLoads!.find((c) => c.cls === "Y")!;
    expect(y.seatsPerWeek).toBe(150);
    expect(y.passengersPerWeek).toBe(70);
    expect(loadByCabin(m).J.loadFactor).toBe(0);
  });
});

describe("route reporting: connecting share", () => {
  it("is 0 with no connecting passengers and 2 x one-way / all passengers otherwise", () => {
    expect(connectingShare(0, 1000)).toBe(0);
    expect(connectingShare(50, 1000)).toBeCloseTo(0.1, 9);
    expect(connectingShare(50, 0)).toBe(0);
    expect(connectingShare(900, 1000)).toBe(1);
  });

  const s = runDays(startingScenario(airports, aircraftTypes, 2015), 30);
  it("routes that carry hub traffic report a non-zero share that matches their connecting figures", () => {
    const withHub = Object.values(s.routeReports).filter((r) => (r.connecting?.passengersOneWay ?? 0) > 0);
    expect(withHub.length).toBeGreaterThan(0);
    for (const r of withHub) {
      const share = connectingShare(r.connecting!.passengersOneWay, r.evaluation.passengersPerWeek);
      expect(share, r.routeId).toBeGreaterThan(0);
      expect(share, r.routeId).toBeCloseTo((2 * r.connecting!.passengersOneWay) / r.evaluation.passengersPerWeek, 9);
    }
  });

  it("per-cabin passengers add up to the route total, and no cabin is loaded above its seats", () => {
    for (const r of Object.values(s.routeReports)) {
      const cabins = r.evaluation.cabinLoads ?? [];
      expect(cabins.length, r.routeId).toBeGreaterThan(0);
      const pax = cabins.reduce((t, c) => t + c.passengersPerWeek, 0);
      expect(pax, r.routeId).toBeCloseTo(r.evaluation.passengersPerWeek, 4);
      for (const c of cabins) expect(c.passengersPerWeek, `${r.routeId} ${c.cls}`).toBeLessThanOrEqual(c.seatsPerWeek + 1e-6);
      const seats = cabins.reduce((t, c) => t + c.seatsPerWeek, 0);
      expect(seats, r.routeId).toBeCloseTo(r.evaluation.seatsPerWeek, 4);
    }
  });
});
