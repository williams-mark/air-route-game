import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { applyCommand, runDays, startingScenario, stepDay, type SimState } from "../index";
import { categoryBlockHours, categoryMembers, categoryOfAircraft } from "./categories";
import { refreshCategoryRanking } from "./rebalance";
import { networkWeeklyResult } from "../route/liveModel";
import { layoutSeats } from "../fleet/layout";

const base = () => startingScenario(airports, aircraftTypes, 2015); // LAX: 3 B737-800, 1 A320, 2 B757-200, 2 B777-200ER
const ok = <S,>(r: { state: S; result: { ok: boolean } }) => { expect(r.result).toMatchObject({ ok: true }); return r.state; };

/** Category "Narrowbody" automatically holding the 737-800s and the A320; LAX-SFO and LAX-SAN assigned to it. */
function narrow(): SimState {
  let s = ok(applyCommand(base(), { kind: "createCategory", name: "Narrowbody", autoTypeIds: ["B737-800", "A320"] }));
  s = ok(applyCommand(s, { kind: "setRouteCategory", routeId: "route-1", categoryId: "cat-1" })); // LAX-SFO, 42/wk
  s = ok(applyCommand(s, { kind: "setRouteCategory", routeId: "route-2", categoryId: "cat-1" })); // LAX-SAN, 14/wk
  return s;
}

describe("aircraft categories", () => {
  it("membership: automatic types, explicit placement, and explicit none", () => {
    let s = narrow();
    const m = categoryMembers(s.planner, s.world.fleet).get("cat-1")!;
    expect(m.map((id) => s.world.fleet.find((a) => a.id === id)!.typeId).sort()).toEqual(["A320", "B737-800", "B737-800", "B737-800"]);
    const a320 = s.world.fleet.find((a) => a.typeId === "A320")!.id;
    s = ok(applyCommand(s, { kind: "setAircraftCategory", aircraftIds: [a320], categoryId: null }));
    expect(categoryOfAircraft(s.planner, s.world.fleet).has(a320)).toBe(false);
    s = ok(applyCommand(s, { kind: "createCategory", name: "Special" }));
    s = ok(applyCommand(s, { kind: "setAircraftCategory", aircraftIds: [a320], categoryId: "cat-2" }));
    expect(categoryOfAircraft(s.planner, s.world.fleet).get(a320)).toBe("cat-2");
  });

  it("a categorised route may be flown by any aircraft of the category, and only by them", () => {
    const s = stepDay(narrow());
    const types = (rid: string) => Object.keys(s.routeReports[rid]!.scheduling!.roundTripsByAircraft!).map((id) => s.world.fleet.find((a) => a.id === id)!.typeId);
    const flying = new Set([...types("route-1"), ...types("route-2")]);
    expect([...flying].every((t) => t === "B737-800" || t === "A320")).toBe(true);
    expect(s.routeReports["route-1"]!.scheduling!.scheduledFrequency + s.routeReports["route-2"]!.scheduling!.scheduledFrequency).toBeGreaterThan(0);
  });

  it("the fullest route (last month's ranking) gets the largest aircraft first", () => {
    let s = narrow();
    // Give one 737-800 a dense cabin so it is clearly the largest aircraft of the category.
    const big = s.world.fleet.find((a) => a.typeId === "B737-800")!;
    const dense = { sections: [{ cls: "Y" as const, rows: 31, seatsAcross: 6, pitchIn: 29 }] };
    s = { ...s, world: { ...s.world, fleet: s.world.fleet.map((a) => (a.id === big.id ? { ...a, layout: dense } : a)) } };
    const firstPick = (rank: Record<string, number>) => {
      const t = stepDay({ ...s, planner: { ...s.planner!, routeRank: rank, rankDay: s.world.day } });
      const used = (rid: string) => Object.keys(t.routeReports[rid]!.scheduling!.roundTripsByAircraft!);
      return { sfo: used("route-1"), san: used("route-2") };
    };
    expect(layoutSeats(dense)).toBeGreaterThan(layoutSeats(s.world.fleet.find((a) => a.typeId === "A320")!.layout));
    expect(firstPick({ "route-1": 0.5, "route-2": 0.95 }).san).toContain(big.id); // SAN ranked fullest: it gets the dense 737 first
    expect(firstPick({ "route-1": 0.95, "route-2": 0.5 }).sfo).toContain(big.id);
  });

  it("ranks monthly by average demand per departure, logs daily in between, and re-ranks when the route set changes", () => {
    const s = runDays(narrow(), 3);
    const pl = s.planner!;
    expect(Object.keys(pl.routeRank!).sort()).toEqual(["route-1", "route-2"]);
    expect(pl.rankScore!["route-1"]).toBeGreaterThan(0);
    // Mid-month: only the demand log moves; the ranking and its day stay.
    const next = refreshCategoryRanking(s);
    expect(next.planner!.routeRank).toEqual(pl.routeRank);
    expect(next.planner!.rankDay).toBe(pl.rankDay);
    expect(next.planner!.demandLog!["route-1"]!.days).toBe(pl.demandLog!["route-1"]!.days + 1);
    expect(runDays(s, 40).planner!.rankDay).not.toBe(pl.rankDay);
    const off = ok(applyCommand(s, { kind: "setRouteCategory", routeId: "route-2", categoryId: null }));
    expect(Object.keys(refreshCategoryRanking(off).planner!.routeRank!)).toEqual(["route-1"]);
  });

  /** A state on the 1st of a month with a given previous ranking and this month's logged demand per departure. */
  const monthStart = (rank: Record<string, number>, perDeparture: Record<string, number>): SimState => {
    let s = runDays(narrow(), 2);
    while (new Date(Date.UTC(2015, 0, 1 + s.world.day)).getUTCDate() !== 1) s = { ...s, world: { ...s.world, day: s.world.day + 1 } };
    const demandLog = Object.fromEntries(Object.entries(perDeparture).map(([id, d]) => [id, { sum: d * 30, days: 30 }]));
    return { ...s, planner: { ...s.planner!, routeRank: rank, rankDay: s.world.day - 30, demandLog } };
  };
  const order = (s: SimState) => Object.entries(s.planner!.routeRank!).sort((a, b) => b[1] - a[1]).map(([id]) => id);

  it("stickiness: last month's order stands unless the lower route has clearly more demand (over 12%)", () => {
    const close = refreshCategoryRanking(monthStart({ "route-2": 2, "route-1": 1 }, { "route-2": 100, "route-1": 110 }));
    expect(order(close)).toEqual(["route-2", "route-1"]); // 10% more is not enough to swap
  });

  it("a clear demand lead only swaps when the network earns more with it (the profit check)", () => {
    const s = monthStart({ "route-2": 2, "route-1": 1 }, { "route-2": 60, "route-1": 160 });
    const swapped = refreshCategoryRanking(s);
    const profit = (rank: Record<string, number>) => networkWeeklyResult({ ...s, planner: { ...s.planner!, routeRank: rank } });
    const better = profit({ "route-1": 2, "route-2": 1 }) > profit({ "route-2": 2, "route-1": 1 });
    expect(order(swapped)).toEqual(better ? ["route-1", "route-2"] : ["route-2", "route-1"]);
  });

  it("does not flip-flop: over six months of play the order changes at most once", () => {
    let s = narrow();
    const orders: string[] = [];
    for (let m = 0; m < 6; m++) { s = runDays(s, 31); orders.push(order(s).join(",")); }
    const changes = orders.slice(1).filter((o, i) => o !== orders[i]).length;
    expect(changes).toBeLessThanOrEqual(1);
  }, 120_000);

  it("route checks use the category's block-hour pool, and a new route can open straight into a category", () => {
    const s = narrow();
    const pool = categoryBlockHours(s, "cat-1", "LAX");
    expect(pool.available).toBeGreaterThan(0);
    expect(pool.used).toBeGreaterThan(0);
    const r = applyCommand(s, { kind: "openCategoryRoute", categoryId: "cat-1", route: { origin: "LAX", destination: "LAS", weeklyFrequency: 7, fares: { Y: 90 }, typeId: "A320" } });
    expect(r.result).toMatchObject({ ok: true, kind: "openCategoryRoute", categoryId: "cat-1" });
    expect(applyCommand(s, { kind: "openCategoryRoute", categoryId: "cat-9", route: { origin: "LAX", destination: "LAS", weeklyFrequency: 7, fares: { Y: 90 }, typeId: "A320" } }).result)
      .toMatchObject({ ok: false, error: "unknown_category" });
    const tooMuch = applyCommand(s, { kind: "openCategoryRoute", categoryId: "cat-1", route: { origin: "LAX", destination: "LAS", weeklyFrequency: 84, fares: { Y: 90 }, typeId: "A320" } });
    expect(tooMuch.result).toMatchObject({ ok: false, error: "insufficient_block_hours" });
  });

  it("deleting a category hands its routes back to their own type; names are unique; old saves are unchanged", () => {
    const s = ok(applyCommand(narrow(), { kind: "deleteCategory", categoryId: "cat-1" }));
    expect(s.planner!.routeCategory).toEqual({});
    expect(applyCommand(narrow(), { kind: "createCategory", name: "narrowbody" }).result).toMatchObject({ ok: false, error: "invalid_category" });
    const plain = base();
    expect(JSON.stringify(stepDay(plain).routeReports)).toBe(JSON.stringify(stepDay(base()).routeReports));
    expect(stepDay(plain).planner).toBeUndefined();
  });
});
