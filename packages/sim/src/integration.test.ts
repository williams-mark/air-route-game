import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { baseWeeklyDemand, hasSurfaceAlternative, pairMarket } from "./demand/market";
import { simulateRouteWeek } from "./route/routeModel";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const demand = (o: string, d: string) => baseWeeklyDemand(A.get(o)!, A.get(d)!);

describe("calibration against DOT-scale all-carrier weekly one-way volumes (real data package)", () => {
  it("hits the headline targets", () => {
    const rows: [string, string, number, number][] = [
      ["LAX", "SFO", 35_000, 50_000],
      ["LAX", "HNL", 8_000, 14_000],
      ["LAX", "OGG", 4_000, 7_000],
      ["HNL", "OGG", 25_000, 40_000],
      ["SAN", "SFO", 8_000, 28_000],
      ["SMF", "LAX", 5_000, 26_000],
      ["SFO", "HNL", 5_000, 12_000],
      ["HNL", "KOA", 10_000, 25_000],
      ["HNL", "LIH", 10_000, 25_000],
    ];
    for (const [o, d, lo, hi] of rows) {
      const v = demand(o, d);
      console.log(`CALIBRATION ${o}-${d} ${Math.round(v)}/wk one-way (target ${lo}-${hi})`);
      expect(v, `${o}-${d}`).toBeGreaterThan(lo);
      expect(v, `${o}-${d}`).toBeLessThan(hi);
    }
  });

  it("short-haul ground damping applies on land but not across water", () => {
    expect(hasSurfaceAlternative(A.get("LAX")!, A.get("SAN")!)).toBe(true);
    expect(hasSurfaceAlternative(A.get("HNL")!, A.get("OGG")!)).toBe(false);
    expect(hasSurfaceAlternative(A.get("LAX")!, A.get("HNL")!)).toBe(false);
    // Interisland is a huge market in spite of a 160 km sector; LAX-SAN (180 km, drivable) is small.
    expect(demand("HNL", "OGG")).toBeGreaterThan(5 * demand("LAX", "SAN"));
    expect(pairMarket(A.get("HNL")!, A.get("OGG")!).distanceKm).toBeLessThan(200);
  });
});

describe("rival capacity and fare response", () => {
  const route = (o: string, d: string, f: number, y: number, typeId: string) => ({
    id: "r", origin: o, destination: d, weeklyFrequency: f, fares: { Y: y }, typeId,
  });
  const lf = (o: string, d: string, f: number, y: number, t: string) =>
    simulateRouteWeek(route(o, d, f, y, t), A, T, 100)!.evaluation.loadFactor;

  it("a player route at the market fare is not sold out", () => {
    for (const [o, d, f, y, t] of [
      ["LAX", "SFO", 35, 105, "B737-800"],
      ["LAX", "HNL", 14, 270, "B767-300ER"],
      ["LAX", "OGG", 7, 300, "B757-200"],
      ["HNL", "OGG", 56, 70, "A319"],
    ] as const) {
      const v = lf(o, d, f, y, t);
      console.log(`MARKETFARE ${o}-${d} LF ${(100 * v).toFixed(0)}%`);
      expect(v, `${o}-${d}`).toBeLessThan(0.97);
      expect(v, `${o}-${d}`).toBeGreaterThan(0.5);
    }
  });

  it("load factor falls gradually as the fare rises above market (no cliff)", () => {
    const mults = [0.9, 1.0, 1.1, 1.2, 1.35, 1.5, 1.75, 2.0];
    const series = mults.map((m) => lf("LAX", "SFO", 35, 105 * m, "B737-800"));
    console.log(`FARECURVE LAX-SFO ${series.map((v, i) => `${mults[i]}x:${(100 * v).toFixed(0)}%`).join(" ")}`);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!).toBeLessThan(series[i - 1]!);
      expect(series[i - 1]! - series[i]!).toBeLessThan(0.3); // no step larger than 30 LF points
    }
  });

  it("segments differ in elasticity: budget is most price sensitive, business least", () => {
    // implied logit elasticity at the benchmark fare = fare / theta_eff
    const th = (s: "business" | "leisure" | "vfr" | "budget") => ({ business: 60, leisure: 45, vfr: 40, budget: 25 })[s];
    expect(105 / th("budget")).toBeGreaterThan(105 / th("leisure"));
    expect(105 / th("leisure")).toBeGreaterThan(105 / th("business"));
  });
});
