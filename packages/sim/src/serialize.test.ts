import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "./scenario";
import { applyCommand, defaultLayout, stepDay } from "./index";
import { makeSave, parseSave, SAVE_VERSION, stringifySave } from "./serialize";
import { rivalNews, rivalReports } from "./rivals";

const run = (s: ReturnType<typeof startingScenario>, n: number) => { for (let i = 0; i < n; i++) s = stepDay(s); return s; };

describe("save serialization", () => {
  it("save at day 60, load, run 60 more equals 120 straight", () => {
    const start = startingScenario(airports, aircraftTypes, 2015);
    const straight = run(start, 120);
    const mid = run(start, 60);
    const parsed = parseSave(stringifySave(makeSave(mid, { appVersion: "t", savedAt: "2026-01-01T00:00:00Z" })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.stringify(parsed.save.state)).toBe(JSON.stringify(mid));
    const resumed = run(parsed.save.state, 60);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(straight));
    expect(resumed.rivals).toEqual(straight.rivals);
    expect(resumed.offers).toEqual(straight.offers);
    expect(rivalReports(resumed)).toEqual(rivalReports(straight));
    expect(rivalNews(resumed)).toEqual(rivalNews(straight));
  });

  it("rejects bad input with friendly errors", () => {
    expect(parseSave("{nope")).toMatchObject({ ok: false, code: "not_json" });
    expect(parseSave("{}")).toMatchObject({ ok: false, code: "not_a_save" });
    const st = startingScenario(airports, aircraftTypes, 7);
    const good = makeSave(st, { appVersion: "t" });
    expect(parseSave(JSON.stringify({ ...good, version: SAVE_VERSION + 1 }))).toMatchObject({ ok: false, code: "version_mismatch" });
    expect(parseSave(JSON.stringify({ ...good, state: { world: {} } }))).toMatchObject({ ok: false, code: "corrupt" });
  });
});

import { validateSimState } from "./serialize";

describe("validateSimState / parseSave on damaged saves", () => {
  const good = () => JSON.parse(JSON.stringify(run(startingScenario(airports, aircraftTypes, 11), 40)));
  const text = (st: unknown) => JSON.stringify({ format: "air-route-game-save", version: SAVE_VERSION, savedAt: "x", appVersion: "t", seed: 11, state: st });

  it("accepts a valid mid-game state, including with orders", () => {
    expect(validateSimState(good())).toEqual([]);
    expect(parseSave(text(good())).ok).toBe(true);
  });

  const cases: Array<[string, (s: any) => void, RegExp]> = [
    ["missing orders", (s) => { delete s.orders; }, /orders/],
    ["orders of the wrong type", (s) => { s.orders = {}; }, /orders/],
    ["missing fleetMeta", (s) => { delete s.fleetMeta; }, /fleetMeta/],
    ["missing counters", (s) => { delete s.counters; }, /counters/],
    ["cash is a string", (s) => { s.world.cash = "lots"; }, /cash/],
    ["route to an unknown airport", (s) => { s.world.routes[0].destination = "ZZZ"; }, /unknown airport/],
    ["route with an unknown type", (s) => { s.world.routes[0].typeId = "X999"; }, /unknown aircraft type/],
    ["aircraft with an unknown type", (s) => { s.world.fleet[0].typeId = "X999"; }, /unknown type/],
    ["aircraft without a bookkeeping record", (s) => { delete s.fleetMeta[s.world.fleet[0].id]; }, /bookkeeping/],
    ["aircraft with a broken layout", (s) => { s.world.fleet[0].layout = { sections: [{ cls: "Q", rows: 1, seatsAcross: 1, pitchIn: 30 }] }; }, /cabin section/],
    ["aircraft with no layout", (s) => { delete s.world.fleet[0].layout; }, /cabin/],
    ["duplicate aircraft ids", (s) => { s.world.fleet.push({ ...s.world.fleet[0] }); }, /twice/],
    ["home airport that does not exist", (s) => { s.baseAirport = "ZZZ"; }, /home airport/],
    ["invalid speed", (s) => { s.speed = 9; }, /speed/],
    ["route report for a missing route", (s) => { s.routeReports["ghost"] = {}; }, /missing route/],
    ["rivals of the wrong shape", (s) => { s.rivals = { airlines: 3 }; }, /rivals/],
    ["null state", () => {}, /./],
  ];
  for (const [name, mutate, msg] of cases) {
    it(`rejects: ${name}`, () => {
      const st = good();
      mutate(st);
      const problems = validateSimState(name === "null state" ? null : st);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(" | ")).toMatch(msg);
      const r = parseSave(text(name === "null state" ? null : st));
      expect(r).toMatchObject({ ok: false, code: "corrupt" });
    });
  }

  it("rejects bad order references (missing aircraft, bad layout, wrong deliveries)", () => {
    const s0 = startingScenario(airports, aircraftTypes, 11);
    const ordered = applyCommand(s0, { kind: "orderAircraft", typeId: "A320", count: 2, layout: defaultLayout(aircraftTypes.find((t) => t.id === "A320")!) }).state;
    const base = () => JSON.parse(JSON.stringify(ordered));
    expect(validateSimState(base())).toEqual([]);
    const a = base(); a.orders[0].aircraftIds[0] = "ac-ghost";
    expect(validateSimState(a).join()).toMatch(/missing aircraft/);
    const b = base(); b.orders[0].layout = null;
    expect(validateSimState(b).join()).toMatch(/cabin/);
    const c = base(); c.orders[0].deliveryDays = [];
    expect(validateSimState(c).join()).toMatch(/delivery/);
    const d = base(); d.orders[0].typeId = "nope";
    expect(validateSimState(d).join()).toMatch(/unknown type/);
    const e = base(); e.fleetMeta[e.orders[0].aircraftIds[0]].orderId = "order-404";
    expect(validateSimState(e).join()).toMatch(/missing order/);
  });

  it("accepts older layouts that newer cabin rules would refuse (structure only)", () => {
    const st = good();
    st.world.fleet[0].layout = { sections: [{ cls: "Y", rows: 20, seatsAcross: 6, pitchIn: 30 }] };
    expect(validateSimState(st)).toEqual([]);
  });

  it("loads a version-1 save (small world, no country/landmass) and keeps playing in the larger world", () => {
    const st = run(startingScenario(airports, aircraftTypes, 2015), 30);
    const old = JSON.parse(JSON.stringify(st)) as typeof st;
    const inSave = new Set(old.airports.map((a) => a.id));
    // Make it look like a v1 save: only the West Coast airports, without the fields v2 added.
    old.airports = old.airports.filter((a) => ["CA", "HI", "OR", "WA"].includes(a.region)).map((a) => {
      const { country: _c, landmass: _l, ...rest } = a as unknown as Record<string, unknown>;
      return rest as unknown as (typeof old.airports)[number];
    });
    const save = { ...makeSave(old, { appVersion: "t", savedAt: "2026-01-01T00:00:00Z" }), version: 1 };
    const parsed = parseSave(JSON.stringify(save));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.version).toBe(SAVE_VERSION);
    const ap = parsed.save.state.airports;
    expect(ap.every((a) => a.country && a.landmass)).toBe(true);
    expect(ap.find((a) => a.id === "LAX")!.country).toBe("US");
    expect(ap.find((a) => a.id === "HNL")!.landmass).toBe("US-HI");
    expect(ap.length).toBeGreaterThanOrEqual(inSave.size);
    expect(ap.some((a) => a.id === "FRA")).toBe(true);
    const next = run(parsed.save.state, 10);
    expect(next.world.day).toBe(parsed.save.state.world.day + 10);
  });
});
