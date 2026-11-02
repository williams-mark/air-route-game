import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Aircraft, Route } from "@arg/contracts";
import { applyCommand, stepDay } from "../index";
import { assign, defaultLayout, initialMeta, runDays, startingScenario, newSim, makeSave, parseSave, stringifySave, type SimState } from "../index";
import { makeRng } from "../rng";
import { applyPlannerCommand, coverageGaps, forecastFleet, plannerDemoFleet, plannerPrefs, suggestCover, EMPTY_PLANNER, type PlannerCommand } from "./index";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const ctx = { airports: A, types: T };
const ac = (id: string, typeId: string, over: Partial<Aircraft> = {}): Aircraft => ({
  id, typeId, tailNumber: `N${id}`, layout: defaultLayout(T.get(typeId)!), status: "active", ageDays: 1000,
  hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 }, ...over,
});
const route = (id: string, o: string, d: string, freq: number, typeId: string): Route => ({ id, origin: o, destination: d, weeklyFrequency: freq, fares: { Y: 150 }, typeId });

/** A hand-built sim: given fleet and routes, check clocks far from due unless overridden. */
function mini(fleet: Aircraft[], routes: Route[], metaOver: Record<string, Partial<SimState["fleetMeta"][string]>> = {}): SimState {
  const base = newSim(5, airports, aircraftTypes, { notionalFleet: false }, { cash: 5e8, fleet, routes, airlineName: "T", baseAirport: "LAX" });
  const fleetMeta = { ...base.fleetMeta };
  for (const a of fleet) {
    const m = initialMeta(a, makeRng(1));
    fleetMeta[a.id] = { ...m, daysSince: { A: 0, B: 0, C: 0, D: 0 }, intervals: { A: 500, B: 180, C: 600, D: 3000 }, ...(metaOver[a.id] ?? {}) };
  }
  return { ...base, fleetMeta };
}

describe("forecast", () => {
  const demo = plannerDemoFleet(airports, aircraftTypes, 7);

  it("is deterministic and does not touch the input", () => {
    const before = JSON.stringify(demo);
    const a = forecastFleet(demo, 365);
    const b = forecastFleet(demo, 365);
    expect(a).toEqual(b);
    expect(JSON.stringify(demo)).toBe(before);
  });

  it("matches the real B/C/D check starts when nothing is deferred (no routes, so no deferral)", () => {
    const quiet: SimState = { ...demo, world: { ...demo.world, routes: [] } };
    const fc = forecastFleet(quiet, 400);
    const actual: Array<[string, number, string]> = [];
    let s = quiet;
    for (let i = 0; i < 400; i++) {
      const prev = s;
      s = stepDay(s);
      for (const [id, m] of Object.entries(s.fleetMeta)) {
        if (m.maintenance && !m.maintenance.refit && prev.fleetMeta[id]?.maintenance == null) actual.push([id, m.maintenance.startDay, m.maintenance.check]);
      }
    }
    const forecast: Array<[string, number, string]> = [];
    for (const f of Object.values(fc.aircraft)) for (const w of f.windows) if (!w.underway && w.startDay < quiet.world.day + 400) forecast.push([f.aircraftId, w.startDay, w.kind]);
    expect(actual.length).toBeGreaterThan(10);
    const key = (x: [string, number, string]) => x.join("|");
    expect(forecast.map(key).sort()).toEqual(actual.map(key).sort());
  });

  it("with routes the real start is never earlier than forecast and at most the grace period later", () => {
    const fc = forecastFleet(demo, 200);
    const first = new Map<string, number>();
    let s = demo;
    for (let i = 0; i < 200; i++) {
      const prev = s;
      s = stepDay(s);
      for (const [id, m] of Object.entries(s.fleetMeta)) if (m.maintenance && !m.maintenance.refit && prev.fleetMeta[id]?.maintenance == null && !first.has(id)) first.set(id, m.maintenance.startDay);
    }
    expect(first.size).toBeGreaterThan(3);
    for (const [id, day] of first) {
      const w = fc.aircraft[id]!.windows.find((x) => !x.underway)!;
      expect(day).toBeGreaterThanOrEqual(w.startDay);
      expect(day).toBeLessThanOrEqual(w.latestStartDay);
    }
  });

  it("predicts the first overnight A check within about a week (flying hours drift with the schedule)", () => {
    const fc = forecastFleet(demo, 120);
    const real = new Map<string, number>();
    let s = demo;
    for (let i = 0; i < 120; i++) {
      const prev = s;
      s = stepDay(s);
      for (const a of s.world.fleet) {
        const was = prev.world.fleet.find((x) => x.id === a.id)!;
        if (!real.has(a.id) && a.status === "active" && was.status === "active" && was.hoursSinceCheck.A > a.hoursSinceCheck.A && !s.fleetMeta[a.id]!.maintenance) real.set(a.id, prev.world.day);
      }
    }
    let compared = 0;
    for (const [id, day] of real) {
      const f = fc.aircraft[id]!.aChecks[0];
      if (f === undefined) continue;
      compared++;
      expect(Math.abs(f - day)).toBeLessThanOrEqual(10);
    }
    expect(compared).toBeGreaterThan(5);
  });

  it("lists delivery dates and refit windows", () => {
    const base = mini([ac("a1", "B737-800"), ac("a2", "B737-800", { status: "delivery" })], [route("r1", "LAX", "SFO", 14, "B737-800")]);
    const s: SimState = { ...base, fleetMeta: { ...base.fleetMeta, a2: { ...base.fleetMeta["a2"]!, deliveryDay: base.world.day + 20 } } };
    expect(forecastFleet(s, 90).aircraft["a2"]!.deliveryDay).toBe(base.world.day + 20);
    const r = applyCommand(s, { kind: "refitAircraft", aircraftId: "a1", layout: defaultLayout(T.get("B737-800")!) });
    expect(r.result.ok).toBe(true);
    const w = forecastFleet(r.state, 60).aircraft["a1"]!.windows[0]!;
    expect(w).toMatchObject({ kind: "refit", underway: true });
  });
});

describe("coverage and cover suggestions", () => {
  // LAX-HNL 14/wk on 767s: p1 and p2 fly it, p3 (same type) and w1 (777, larger) are reserved spares, n1 (E175) cannot fly it.
  const fleet = [ac("p1", "B767-300ER"), ac("p2", "B767-300ER"), ac("w1", "B777-200ER"), ac("n1", "E175"), ac("p3", "B767-300ER")];
  const hnl = route("r1", "LAX", "HNL", 14, "B767-300ER");
  /** p1 hits its C check in 10 days. */
  const mk = () => {
    let s = mini(fleet, [hnl], { p1: { daysSince: { A: 0, B: 10, C: 590, D: 10 } } });
    s = applyCommand(s, { kind: "reserveAircraft", aircraftId: "p3", reserve: true }).state;
    s = applyCommand(s, { kind: "reserveAircraft", aircraftId: "w1", reserve: true }).state;
    return s;
  };

  it("finds the window where a route loses rotations and names the aircraft", () => {
    const s = mk();
    const gaps = coverageGaps(s, 90);
    const g = gaps.find((x) => x.routeId === "r1" && !x.structural)!;
    expect(g).toBeDefined();
    expect(g.fromDay).toBe(s.world.day + 10);
    expect(g.toDay).toBe(s.world.day + 10 + 21 - 1);
    expect(g.lostToDowntime).toBeGreaterThan(0);
    expect(g.causes.map((c) => c.aircraftId)).toEqual(["p1"]);
    expect(g.causes[0]!.kind).toBe("C");
    expect(g.summary).toMatch(/LAX-HNL loses \d+\/14 weekly rotations/);
    expect(g.summary).toContain("Np1");
  });

  it("ranks the reserved same-type spare ahead of a widebody and omits infeasible aircraft", () => {
    const s = mk();
    const g = coverageGaps(s, 90).find((x) => !x.structural)!;
    const picks = suggestCover(s, g);
    const ids = picks.map((p) => p.aircraftId);
    expect(ids[0]).toBe("p3");
    expect(picks[0]).toMatchObject({ sameType: true });
    expect(ids).toContain("w1");
    expect(ids.indexOf("w1")).toBeGreaterThan(0);
    expect(picks.find((p) => p.aircraftId === "w1")).toMatchObject({ sameType: false, sameSizeClass: true });
    expect(ids).not.toContain("n1"); // an E175 cannot fly LAX-HNL
    expect(ids).not.toContain("p1");
    expect(picks[0]!.score).toBeGreaterThan(picks.find((p) => p.aircraftId === "w1")!.score);
  });

  it("applyCover creates a time-boxed pin that closes the gap and expires", () => {
    let s = mk();
    const g = coverageGaps(s, 90).find((x) => !x.structural)!;
    const top = suggestCover(s, g)[0]!;
    const r = applyCommand(s, { kind: "applyCover", aircraftId: top.aircraftId, routeId: g.routeId, fromDay: g.fromDay, toDay: g.toDay, gapId: g.id });
    expect(r.result.ok).toBe(true);
    s = r.state;
    expect(coverageGaps(s, 90).filter((x) => !x.structural)).toHaveLength(0);
    // The pin is active only inside the window.
    expect(plannerPrefs(s, g.fromDay - 1)?.pins?.has("p3") ?? false).toBe(false);
    expect(plannerPrefs(s, g.fromDay)?.pins?.get("p3")).toBe("r1");
    expect(plannerPrefs(s, g.toDay + 1)?.pins?.has("p3") ?? false).toBe(false);
  });

  it("ignored gaps are not listed", () => {
    let s = mk();
    const g = coverageGaps(s, 90).find((x) => !x.structural)!;
    s = applyCommand(s, { kind: "ignoreGap", gapId: g.id, ignore: true }).state;
    expect(coverageGaps(s, 90).some((x) => x.id === g.id)).toBe(false);
  });
});

describe("scheduler preferences", () => {
  it("honours a pin, even to a different size class, and reports it as substituted", () => {
    const fleet = [ac("n1", "B737-800"), ac("w1", "B777-200ER")];
    const routes = [route("r1", "LAX", "SFO", 7, "B737-800")];
    const r = assign(routes, fleet, { ...ctx, prefs: { pins: new Map([["w1", "r1"]]) } });
    expect(r.routes["r1"]!.aircraftIds[0]).toBe("w1");
    expect(r.routes["r1"]!.substitutedFrequency).toBeGreaterThan(0);
    expect(assign(routes, fleet, ctx).routes["r1"]!.aircraftIds).toEqual(["n1"]);
  });

  it("ignores a pin the aircraft cannot fly or that is in a check", () => {
    const routes = [route("r1", "LAX", "HNL", 7, "B767-300ER")];
    const prefs = { pins: new Map([["e1", "r1"]]) };
    expect(assign(routes, [ac("e1", "E175"), ac("p1", "B767-300ER")], { ...ctx, prefs }).routes["r1"]!.aircraftIds).toEqual(["p1"]);
    const r = assign(routes, [ac("w1", "B777-200ER", { status: "maintenance" }), ac("p1", "B767-300ER")], { ...ctx, prefs: { pins: new Map([["w1", "r1"]]) } });
    expect(r.routes["r1"]!.aircraftIds).toEqual(["p1"]);
  });

  it("uses preferred types in order before same-class substitutes", () => {
    const routes = [route("r1", "LAX", "SFO", 7, "B737-800")];
    const fleet = [ac("w1", "A330-200"), ac("w2", "B787-9")];
    expect(assign(routes, fleet, ctx).routes["r1"]!.scheduledFrequency).toBe(0);
    const pref = (order: string[]) => assign(routes, fleet, { ...ctx, prefs: { routeTypes: new Map([["r1", order]]) } }).routes["r1"]!;
    expect(pref(["B787-9", "A330-200"]).aircraftIds[0]).toBe("w2");
    expect(pref(["A330-200", "B787-9"]).aircraftIds[0]).toBe("w1");
  });

  it("does not schedule reserved spares, unless pinned", () => {
    const routes = [route("r1", "LAX", "SFO", 14, "B737-800")];
    const fleet = [ac("n1", "B737-800"), ac("n2", "B737-800")];
    const reserved = new Set(["n1"]);
    const r = assign(routes, fleet, { ...ctx, prefs: { reserved } });
    expect(r.aircraft["n1"]).toBeUndefined();
    expect(r.routes["r1"]!.aircraftIds).toEqual(["n2"]);
    const pinned = assign(routes, fleet, { ...ctx, prefs: { reserved, pins: new Map([["n1", "r1"]]) } });
    expect(pinned.routes["r1"]!.aircraftIds).toContain("n1");
  });

  it("empty or absent preferences reproduce the default schedule exactly", () => {
    const s = plannerDemoFleet(airports, aircraftTypes, 3);
    const base = assign(s.world.routes, s.world.fleet, ctx);
    for (const prefs of [undefined, {}, { pins: new Map(), routeTypes: new Map(), reserved: new Set<string>() }]) {
      expect(assign(s.world.routes, s.world.fleet, { ...ctx, prefs })).toEqual(base);
    }
  });
});

describe("planner state in the sim", () => {
  const start = startingScenario(airports, aircraftTypes, 2015);

  it("an empty planner block does not change 120 days of results", () => {
    const plain = runDays(start, 120);
    const withEmpty = runDays({ ...start, planner: EMPTY_PLANNER }, 120);
    expect(JSON.stringify({ ...withEmpty, planner: undefined })).toBe(JSON.stringify(plain));
  });

  it("a pin changes who flies, deterministically, and survives save/load", () => {
    const wide = start.world.fleet.find((a) => a.typeId === "B777-200ER")!;
    const r = applyCommand(start, { kind: "pinAircraft", aircraftId: wide.id, routeId: "route-1" }); // LAX-SFO on a 777
    expect(r.result.ok).toBe(true);
    const after = runDays(r.state, 10);
    expect(after.routeReports["route-1"]!.scheduling!.aircraftIds).toContain(wide.id);
    const parsed = parseSave(stringifySave(makeSave(r.state, { appVersion: "t", savedAt: "x" })));
    if (!parsed.ok) throw new Error("save failed");
    expect(parsed.save.state.planner).toEqual(r.state.planner);
    expect(JSON.stringify(runDays(parsed.save.state, 10))).toBe(JSON.stringify(after));
  });

  it("saves without a planner block load and run with defaults", () => {
    const text = stringifySave(makeSave(start, { appVersion: "t", savedAt: "x" }));
    expect(text).not.toContain('"planner"');
    const parsed = parseSave(text);
    if (!parsed.ok) throw new Error("load failed");
    expect(coverageGaps(parsed.save.state, 30)).toBeDefined();
    expect(() => runDays(parsed.save.state, 5)).not.toThrow();
  });

  it("rejects bad commands with typed errors and leaves the state alone", () => {
    for (const cmd of [
      { kind: "pinAircraft", aircraftId: "nope", routeId: "route-1" },
      { kind: "pinAircraft", aircraftId: "ac-1", routeId: "nope" },
      { kind: "pinAircraft", aircraftId: "ac-1", routeId: "route-4" }, // 737 to OGG (runway)
      { kind: "setRouteTypes", routeId: "route-1", preferredTypeIds: ["XX"] },
      { kind: "reserveAircraft", aircraftId: "nope", reserve: true },
      { kind: "applyCover", aircraftId: "ac-1", routeId: "route-1", fromDay: 10, toDay: 5 },
    ] as PlannerCommand[]) {
      const out = applyPlannerCommand(start, cmd);
      expect(out.result.ok).toBe(false);
      expect(out.state).toBe(start);
    }
  });

  it("setRouteTypes stores an ordered list without the primary type", () => {
    const out = applyCommand(start, { kind: "setRouteTypes", routeId: "route-4", preferredTypeIds: ["B757-200", "A330-200", "A330-200"] });
    expect(out.result).toMatchObject({ ok: true, preferredTypeIds: ["A330-200"] });
    expect(out.state.planner!.routeTypes["route-4"]).toEqual(["A330-200"]);
  });
});
