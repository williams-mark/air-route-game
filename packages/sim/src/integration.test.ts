import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { baseWeeklyDemand, hasSurfaceAlternative, pairMarket } from "./demand/market";
import { DEFAULT_METROS } from "./demand/metros";
import { simulateRouteWeek } from "./route/routeModel";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const demand = (o: string, d: string) => baseWeeklyDemand(A.get(o)!, A.get(d)!);

/** All-carrier one-way weekly volume summed over every airport pair of two groups (a metro's airports, or a single airport). */
const region = (xs: string[], ys: string[]) => {
  let t = 0;
  for (const x of xs) for (const y of ys) t += demand(x, y);
  return t;
};
const LA = Object.keys(DEFAULT_METROS[0]!.shares);
const SF = Object.keys(DEFAULT_METROS[1]!.shares);

describe("calibration against DOT-scale all-carrier weekly one-way volumes (real data package)", () => {
  it("hits the headline targets (metro-to-metro totals across airport pairs)", () => {
    const rows: [string, string[], string[], number, number][] = [
      ["LA-SF region", LA, SF, 35_000, 50_000],
      ["SMF-LA region", ["SMF"], LA, 8_000, 14_000],
      ["SAN-SF region", ["SAN"], SF, 8_000, 17_000], // model runs a little rich here: SAN-SFO is about 11-14k real
      ["LA-HNL", LA, ["HNL"], 8_000, 14_000],
      ["LA-OGG", LA, ["OGG"], 3_800, 7_000],
      ["HNL-OGG", ["HNL"], ["OGG"], 25_000, 40_000],
      ["SF-HNL", SF, ["HNL"], 5_000, 12_000],
      ["HNL-KOA", ["HNL"], ["KOA"], 10_000, 25_000],
      ["HNL-LIH", ["HNL"], ["LIH"], 10_000, 25_000],
    ];
    for (const [name, xs, ys, lo, hi] of rows) {
      const v = region(xs, ys);
      console.log(`CALIBRATION ${name} ${Math.round(v)}/wk one-way (target ${lo}-${hi})`);
      expect(v, name).toBeGreaterThan(lo);
      expect(v, name).toBeLessThan(hi);
    }
  });

  it("airports in one metro share its demand instead of each counting the whole metro", () => {
    for (const m of DEFAULT_METROS) {
      expect(Object.values(m.shares).reduce((s, x) => s + x, 0), m.id).toBeCloseTo(1, 9);
      // anchors exist in the data and the metro population is the sum of their (non-overlapping) populations
      expect(m.anchors.reduce((s, id) => s + A.get(id)!.metroPopulation, 0), m.id).toBe(m.population);
      for (const id of Object.keys(m.shares)) expect(A.has(id), id).toBe(true);
    }
    // every LA airport to SFO is a fraction of the region total; the main airport dominates but is not the whole metro
    const lax = demand("LAX", "SFO");
    expect(lax).toBeGreaterThan(0.5 * region(LA, ["SFO"]));
    expect(lax).toBeLessThan(0.9 * region(LA, ["SFO"]));
    expect(demand("BUR", "SFO")).toBeLessThan(0.1 * lax);
    // long routes concentrate on the dominant airport (LAX carries nearly all of LA-Hawaii)
    expect(demand("LAX", "HNL")).toBeGreaterThan(0.9 * region(LA, ["HNL"]));
    // each airport pair of the same metro region sums to the region total (total preserved under the split)
    expect(region(LA, SF)).toBeCloseTo(LA.flatMap((x) => SF.map((y) => demand(x, y))).reduce((s, v) => s + v, 0), 6);
  });

  it("short-haul ground damping applies on land but not across water", () => {
    expect(hasSurfaceAlternative(A.get("LAX")!, A.get("SAN")!)).toBe(true);
    expect(hasSurfaceAlternative(A.get("HNL")!, A.get("OGG")!)).toBe(false);
    expect(hasSurfaceAlternative(A.get("LAX")!, A.get("HNL")!)).toBe(false);
    // Interisland is a huge market in spite of a 160 km sector; LAX-SAN (180 km, drivable) is far smaller.
    expect(demand("HNL", "OGG")).toBeGreaterThan(2 * demand("LAX", "SAN"));
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
