import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { distanceKm, jan1Day, startingScenario } from "@arg/sim";
import { RealSimBridge } from "../sim/realBridge";
import { ACHIEVEMENTS, LONG_HAUL_KM } from "./definitions";
import { evaluate, freshProgress, JAN_1_2020, JAN_1_2021, type Facts, type Progress } from "./evaluate";
import { factsFrom, lastYearProfit } from "./facts";

const base: Facts = {
  gameKey: "g1", day: 0, campaignStartDay: 0, pandemicOn: true, bankrupt: false, inDistress: false, fleetCount: 8,
  routeIds: ["route-1", "route-2"], longestRouteKm: 800, hubCount: 1, reviewGrade: null, lastYearProfit: null,
};
const with_ = (o: Partial<Facts>): Facts => ({ ...base, ...o });
/** Earned ids for `f`, judged as the first sighting of the game with the base routes as the starting network. */
const earnedFor = (f: Facts, prev: Progress | null = freshProgress(base)) => evaluate(f, prev).earned;

describe("definitions", () => {
  it("has unique ids that Steam accepts", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Z0-9_]{1,64}$/);
    for (const a of ACHIEVEMENTS) { expect(a.name.length).toBeGreaterThan(2); expect(a.description.length).toBeGreaterThan(10); }
  });
  it("evaluate can only return listed ids", () => {
    const all = evaluate(with_({
      routeIds: Array.from({ length: 30 }, (_, i) => `r${i}`), fleetCount: 120, hubCount: 6, longestRouteKm: 9000, day: JAN_1_2021 + 5, inDistress: false,
      reviewGrade: "A", lastYearProfit: { profitUsd: 1, days: 365 },
    }), { ...freshProgress(base), distressSeen: true }).earned;
    const listed = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const id of all) expect(listed.has(id)).toBe(true);
    expect(all.size).toBe(ACHIEVEMENTS.length);
  });
});

describe("evaluate", () => {
  it("earns nothing at the start of a game", () => {
    expect(earnedFor(base).size).toBe(0);
  });

  it("FIRST_ROUTE needs a route that was not in the starting network", () => {
    expect(earnedFor(with_({ routeIds: ["route-1"] })).has("FIRST_ROUTE")).toBe(false);
    expect(earnedFor(with_({ routeIds: ["route-1", "route-2", "route-3"] })).has("FIRST_ROUTE")).toBe(true);
  });

  it("ROUTES_25 at 25 routes", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);
    expect(earnedFor(with_({ routeIds: ids(24) })).has("ROUTES_25")).toBe(false);
    expect(earnedFor(with_({ routeIds: ids(25) })).has("ROUTES_25")).toBe(true);
  });

  it("fleet thresholds at 10, 50 and 100", () => {
    const at = (n: number) => [...earnedFor(with_({ fleetCount: n }))].filter((i) => i.startsWith("FLEET_")).sort();
    expect(at(9)).toEqual([]);
    expect(at(10)).toEqual(["FLEET_10"]);
    expect(at(50)).toEqual(["FLEET_10", "FLEET_50"]);
    expect(at(100)).toEqual(["FLEET_10", "FLEET_100", "FLEET_50"]);
  });

  it("hub thresholds at 2 and 5", () => {
    expect(earnedFor(with_({ hubCount: 1 })).size).toBe(0);
    expect([...earnedFor(with_({ hubCount: 2 }))]).toEqual(["SECOND_HUB"]);
    expect([...earnedFor(with_({ hubCount: 5 }))].sort()).toEqual(["FIVE_HUBS", "SECOND_HUB"]);
  });

  it("FIRST_PROFITABLE_YEAR needs a full year with positive profit", () => {
    const has = (y: Facts["lastYearProfit"]) => earnedFor(with_({ lastYearProfit: y })).has("FIRST_PROFITABLE_YEAR");
    expect(has(null)).toBe(false);
    expect(has({ profitUsd: -5, days: 365 })).toBe(false);
    expect(has({ profitUsd: 0, days: 365 })).toBe(false);
    expect(has({ profitUsd: 5_000_000, days: 200 })).toBe(false);
    expect(has({ profitUsd: 5_000_000, days: 365 })).toBe(true);
  });

  it("LONG_HAUL needs a route over the threshold", () => {
    expect(earnedFor(with_({ longestRouteKm: LONG_HAUL_KM })).has("LONG_HAUL")).toBe(false);
    expect(earnedFor(with_({ longestRouteKm: LONG_HAUL_KM + 1 })).has("LONG_HAUL")).toBe(true);
  });

  describe("PANDEMIC_SURVIVOR", () => {
    const has = (f: Facts, p: Progress = freshProgress(base)) => evaluate(f, p).earned.has("PANDEMIC_SURVIVOR");
    it("is earned on reaching 2021 solvent in a game that began before 2020", () => {
      expect(has(with_({ day: JAN_1_2021 - 1 }))).toBe(false);
      expect(has(with_({ day: JAN_1_2021 }))).toBe(true);
    });
    it("is not earned when bankrupt, when the pandemic is off, or when the game began in 2020 or later", () => {
      expect(has(with_({ day: JAN_1_2021, bankrupt: true }))).toBe(false);
      expect(has(with_({ day: JAN_1_2021, pandemicOn: false }))).toBe(false);
      expect(has(with_({ day: JAN_1_2021 + 10, campaignStartDay: JAN_1_2020 }), { ...freshProgress(base), firstDay: JAN_1_2020 })).toBe(false);
    });
    it("uses the first day seen for an endless game, and the campaign start when there is one", () => {
      const endless = with_({ day: JAN_1_2021 + 100, campaignStartDay: null });
      expect(has(endless, { ...freshProgress(base), firstDay: JAN_1_2021 + 50 })).toBe(false);
      expect(has(endless, { ...freshProgress(base), firstDay: jan1Day(2018) })).toBe(true);
      expect(has(with_({ day: JAN_1_2021 + 100, campaignStartDay: jan1Day(2016) }), { ...freshProgress(base), firstDay: JAN_1_2021 + 50 })).toBe(true);
    });
  });

  describe("DISTRESS_RECOVERY and progress memory", () => {
    it("remembers distress across evaluations and earns on recovery", () => {
      let p = evaluate(base, null).progress;
      expect(p.distressSeen).toBe(false);
      const during = evaluate(with_({ day: 10, inDistress: true }), p);
      expect(during.earned.has("DISTRESS_RECOVERY")).toBe(false);
      expect(during.progress.distressSeen).toBe(true);
      p = during.progress;
      const still = evaluate(with_({ day: 40, inDistress: true }), p);
      expect(still.earned.has("DISTRESS_RECOVERY")).toBe(false);
      const after = evaluate(with_({ day: 60 }), still.progress);
      expect(after.earned.has("DISTRESS_RECOVERY")).toBe(true);
    });
    it("is not earned by going bankrupt, or without ever being in distress", () => {
      const seen = { ...freshProgress(base), distressSeen: true };
      expect(evaluate(with_({ day: 5, bankrupt: true }), seen).earned.has("DISTRESS_RECOVERY")).toBe(false);
      expect(evaluate(with_({ day: 5 }), freshProgress(base)).earned.has("DISTRESS_RECOVERY")).toBe(false);
    });
    it("starts fresh for another game or after loading an earlier day", () => {
      const seen = { ...freshProgress(base), distressSeen: true, lastDay: 500 };
      expect(evaluate(with_({ day: 100 }), seen).progress.distressSeen).toBe(false);
      expect(evaluate(with_({ day: 600, gameKey: "other" }), seen).progress.distressSeen).toBe(false);
      expect(evaluate(with_({ day: 600 }), seen).progress.distressSeen).toBe(true);
    });
    it("takes the starting network from the first sighting only", () => {
      const first = evaluate(with_({ routeIds: ["a", "b", "c"] }), null);
      expect(first.progress.baselineRouteIds).toEqual(["a", "b", "c"]);
      expect(first.earned.has("FIRST_ROUTE")).toBe(false);
      const next = evaluate(with_({ day: 3, routeIds: ["a", "b", "c", "d"] }), first.progress);
      expect(next.progress.baselineRouteIds).toEqual(["a", "b", "c"]);
      expect(next.earned.has("FIRST_ROUTE")).toBe(true);
    });
    it("does not mutate the previous progress", () => {
      const prev = freshProgress(base);
      const copy = JSON.stringify(prev);
      evaluate(with_({ day: 4, inDistress: true }), prev);
      expect(JSON.stringify(prev)).toBe(copy);
    });
  });

  it("campaign grades: A earns both, B earns the B one, C and below earn neither, bankrupt earns neither", () => {
    const g = (grade: Facts["reviewGrade"], bankrupt = false) => [...earnedFor(with_({ reviewGrade: grade, bankrupt }))].sort();
    expect(g("A")).toEqual(["CAMPAIGN_GRADE_A", "CAMPAIGN_GRADE_B"]);
    expect(g("B")).toEqual(["CAMPAIGN_GRADE_B"]);
    expect(g("C")).toEqual([]);
    expect(g("F")).toEqual([]);
    expect(g(null)).toEqual([]);
    expect(g("A", true)).toEqual([]);
  });
});

describe("facts from real sim state", () => {
  const make = (initial = startingScenario(airports, aircraftTypes, 11, { campaignYears: 15 })) => new RealSimBridge({ startPaused: true, initial });
  const facts = (b: RealSimBridge) => factsFrom(b.getState(), b.getSim());

  it("the starting game earns nothing", () => {
    const b = make();
    const f = facts(b);
    expect(f.fleetCount).toBe(8);
    expect(f.routeIds).toHaveLength(4);
    expect(f.hubCount).toBe(1);
    expect(f.campaignStartDay).toBe(jan1Day(2015));
    expect(f.pandemicOn).toBe(true);
    expect(f.reviewGrade).toBeNull();
    expect(evaluate(f, null).earned.size).toBe(0);
  });

  it("opening a route earns FIRST_ROUTE, and a long route sets longestRouteKm", () => {
    const b = make();
    const p0 = evaluate(facts(b), null).progress;
    const r = b.dispatch({ kind: "openRoute", route: { origin: "LAX", destination: "SEA", weeklyFrequency: 1, fares: { Y: 110 }, typeId: "B737-800" } });
    expect(r && r.ok).toBe(true);
    const f = facts(b);
    expect(f.routeIds).toHaveLength(5);
    const lax = airports.find((a) => a.id === "LAX")!;
    const sea = airports.find((a) => a.id === "SEA")!;
    expect(f.longestRouteKm).toBeGreaterThanOrEqual(distanceKm(lax, sea) - 1);
    expect(evaluate(f, p0).earned.has("FIRST_ROUTE")).toBe(true);
  });

  it("unlocking a hub earns SECOND_HUB", () => {
    const b = make(startingScenario(airports, aircraftTypes, 11, { campaignYears: 15 }));
    const sim = b.getSim();
    b.dispatch({ kind: "unlockHub", airportId: "SFO" });
    expect(b.getSim()).not.toBe(sim);
    expect(facts(b).hubCount).toBe(2);
    expect(evaluate(facts(b), null).earned.has("SECOND_HUB")).toBe(true);
  });

  it("the campaign review grade reaches the facts", () => {
    const base0 = startingScenario(airports, aircraftTypes, 7, { campaignYears: 15 });
    const b = make({ ...base0, campaign: { ...base0.campaign!, endDay: base0.world.day + 2 } });
    b.stepDays(2);
    const f = facts(b);
    expect(f.reviewGrade).toBe(b.getState().review!.score.grade);
    expect(["A", "B", "C", "D", "F"]).toContain(f.reviewGrade);
  });

  it("lastYearProfit sums the previous calendar year from the ledger", () => {
    const rec = (day: number, profit: number) => ({ day, cash: 0, revenue: 0, costs: 0, profit, by: {} as never });
    const y2015 = Array.from({ length: 365 }, (_, i) => rec(i, 10));
    const y2016 = Array.from({ length: 10 }, (_, i) => rec(jan1Day(2016) + i, 1));
    expect(lastYearProfit([...y2015, ...y2016], jan1Day(2016) + 9)).toEqual({ profitUsd: 3650, days: 365 });
    expect(lastYearProfit(y2015, 100)).toBeNull();
    expect(lastYearProfit([], 800)).toBeNull();
  });
});
