import { describe, expect, it } from "vitest";
import type { CabinInput } from "./ledger";
import { allocateCabins, evaluateRoute } from "./ledger";
import { jetAPriceUsdPerGallon } from "./fuel";
import { B738, B789, CRJ9, HNL, LAX, OGG, SFO } from "../testing/fixtures";

const DAY_2024 = 9 * 365 + 3 + 180; // mid-2024
const widebody787: CabinInput[] = [
  { cls: "J", seats: 28, fare: 900 },
  { cls: "W", seats: 21, fare: 460 },
  { cls: "Y", seats: 241, fare: 270 },
];

describe("fuel price series", () => {
  it("has the expected shape: 2020 collapse, 2022 spike, Hawaii premium", () => {
    const y = (yr: number, frac: number) => Math.round((yr - 2015) * 365.25 + frac * 365);
    expect(jetAPriceUsdPerGallon(y(2020, 0.3))).toBeLessThan(1.1);
    expect(jetAPriceUsdPerGallon(y(2022, 0.5))).toBeGreaterThan(4);
    expect(jetAPriceUsdPerGallon(y(2016, 0.2))).toBeLessThan(jetAPriceUsdPerGallon(y(2015, 0)));
    expect(jetAPriceUsdPerGallon(100, "HI")).toBeGreaterThan(jetAPriceUsdPerGallon(100, "CA"));
    expect(jetAPriceUsdPerGallon(-50)).toBeCloseTo(jetAPriceUsdPerGallon(0), 2);
    expect(jetAPriceUsdPerGallon(9999)).toBeGreaterThan(0);
  });
});

describe("evaluateRoute worked example (a)", () => {
  it("LAX-HNL daily 787-9 at a reasonable fare has a positive margin", () => {
    const r = evaluateRoute({
      origin: LAX, destination: HNL, aircraft: B789, day: DAY_2024,
      weeklyFrequency: 7, cabins: widebody787, weeklyPassengers: 0.82 * 7 * 2 * 290,
    });
    console.log("LAX-HNL 787-9 daily", {
      feasible: r.feasible, blockH: r.blockHours.toFixed(2), lf: r.loadFactor.toFixed(2),
      revenueWk: Math.round(r.revenue), costsWk: Math.round(r.costs), margin: r.margin.toFixed(3),
      aircraft: r.aircraftEquivalent.toFixed(2), bePct: r.breakEvenLoadFactor?.toFixed(2),
    });
    for (const l of r.lines) console.log(`  ${l.group.padEnd(7)} ${l.label.padEnd(34)} ${Math.round(l.weekly).toString().padStart(9)}  ${l.formula}`);
    expect(r.feasible).toBe(true);
    expect(r.profit).toBeGreaterThan(0);
    expect(r.margin).toBeGreaterThan(0.03);
    expect(r.margin).toBeLessThan(0.35);
    expect(r.blockHours).toBeGreaterThan(5);
    expect(r.blockHours).toBeLessThan(6.5);
    expect(r.aircraftNeeded).toBeLessThanOrEqual(2);
  });

  it("is unprofitable at a very low fare or low load", () => {
    const cheap: CabinInput[] = widebody787.map((c) => ({ ...c, fare: c.fare * 0.5 }));
    const r = evaluateRoute({
      origin: LAX, destination: HNL, aircraft: B789, day: DAY_2024,
      weeklyFrequency: 7, cabins: cheap, weeklyPassengers: 0.82 * 7 * 2 * 290,
    });
    expect(r.profit).toBeLessThan(0);
    const empty = evaluateRoute({
      origin: LAX, destination: HNL, aircraft: B789, day: DAY_2024,
      weeklyFrequency: 7, cabins: widebody787, weeklyPassengers: 0.3 * 7 * 2 * 290,
    });
    expect(empty.profit).toBeLessThan(0);
  });

  it("a 90-seat regional jet cannot reach Hawaii: infeasible with negative margin", () => {
    const r = evaluateRoute({
      origin: LAX, destination: HNL, aircraft: CRJ9, day: DAY_2024,
      weeklyFrequency: 7, cabins: [{ cls: "Y", seats: 90, fare: 270 }], weeklyPassengers: 1000,
    });
    expect(r.feasible).toBe(false);
    expect(r.infeasibleReasons.join(" ")).toMatch(/range/);
    expect(r.revenue).toBe(0);
    expect(r.profit).toBeLessThan(0);
    expect(r.margin).toBeLessThan(0);
    expect(r.flightsPerWeek).toBe(0);
  });

  it("flags runway and seat-count violations", () => {
    const r = evaluateRoute({
      origin: LAX, destination: OGG, aircraft: { ...B789, runwayNeededM: 4000 }, day: DAY_2024, weeklyFrequency: 7,
      cabins: [{ cls: "Y", seats: 300, fare: 300 }], weeklyPassengers: 3000,
    });
    expect(r.feasible).toBe(false);
    expect(r.infeasibleReasons.some((x) => x.startsWith("runway: OGG"))).toBe(true);
  });
});

describe("evaluateRoute mechanics", () => {
  const base = {
    origin: LAX, destination: SFO, aircraft: B738, day: DAY_2024, weeklyFrequency: 14,
    cabins: [{ cls: "J" as const, seats: 16, fare: 380 }, { cls: "Y" as const, seats: 144, fare: 140 }],
  };
  it("sums to profit and has no negative lines", () => {
    const r = evaluateRoute({ ...base, weeklyPassengers: 14 * 2 * 160 * 0.8 });
    const rev = r.lines.filter((l) => l.group === "revenue").reduce((s, l) => s + l.weekly, 0);
    const cost = r.lines.filter((l) => l.group === "cost").reduce((s, l) => s + l.weekly, 0);
    expect(r.revenue).toBeCloseTo(rev, 6);
    expect(r.costs).toBeCloseTo(cost, 6);
    expect(r.profit).toBeCloseTo(rev - cost, 6);
    for (const l of r.lines) { expect(l.weekly).toBeGreaterThanOrEqual(0); expect(l.formula.length).toBeGreaterThan(5); }
  });
  it("caps passengers at seats and ownership 'excluded' drops the line", () => {
    const r = evaluateRoute({ ...base, weeklyPassengers: 1e9, ownership: "excluded" });
    expect(r.passengersPerWeek).toBe(r.seatsPerWeek);
    expect(r.loadFactor).toBeCloseTo(1, 9);
    expect(r.lines.find((l) => l.key === "ownership")).toBeUndefined();
  });
  it("fuel cost rises with the fuel price", () => {
    const cheap = evaluateRoute({ ...base, weeklyPassengers: 2000, day: 5 * 365 + 100 }); // 2020 slump
    const dear = evaluateRoute({ ...base, weeklyPassengers: 2000, day: 7 * 365 + 190 }); // 2022 spike
    const f = (r: typeof cheap) => r.lines.find((l) => l.key === "fuel")!.weekly;
    expect(f(dear)).toBeGreaterThan(f(cheap) * 2);
  });
  it("cabin allocation conserves pax and respects seats", () => {
    const cabins: CabinInput[] = [{ cls: "F", seats: 8, fare: 1 }, { cls: "Y", seats: 100, fare: 1 }];
    const a = allocateCabins(cabins, 90);
    expect(a[0]! + a[1]!).toBeCloseTo(90, 6);
    expect(a[0]!).toBeLessThanOrEqual(8);
    const full = allocateCabins(cabins, 500);
    expect(full).toEqual([8, 100]);
  });
});
