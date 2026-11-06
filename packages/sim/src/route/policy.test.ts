import { describe, expect, it } from "vitest";
import type { Airport, FarePolicy, Route } from "@arg/contracts";
import { applyCommand } from "../commands";
import { aircraftTypes, airports } from "@arg/data";
import { newSim, stepDay, runDays, startingScenario } from "../index";
import { makeSave, parseSave, stringifySave, validateSimState } from "../serialize";
import { checkState } from "../qa/invariants";
import { AIRCRAFT_TYPES, AIRPORTS } from "../testing/fixtures";
import { effectiveConnectionMarkdown, effectiveTargetLoadFactor, routeCategories } from "./farePolicy";
import { backgroundSlots, hubCongestion, weeklySlotFees, weeklySlotsTotal } from "./congestion";

const route = (id: string, o: string, d: string, extra: Partial<Route> = {}): Route => ({ id, origin: o, destination: d, weeklyFrequency: 14, fares: { Y: 120 }, typeId: "B737-800", ...extra });
const policy = (id: string, extra: Partial<FarePolicy> = {}): FarePolicy => ({ id, name: id, targetLoadFactor: null, connectionMarkdown: 0, scope: "all", ...extra });
const sim = (routes: Route[], params = {}) => {
  const s = newSim(7, AIRPORTS, AIRCRAFT_TYPES, params, { baseAirport: "LAX" });
  s.world.routes = routes;
  return s;
};
const lhr: Airport = { ...AIRPORTS[0]!, id: "LHR", country: "GB", region: "GB", lat: 51.47, lon: -0.4543 };

describe("route categories", () => {
  it("bands by distance, domestic vs international, hub-spoke vs point-to-point", () => {
    const all = [...AIRPORTS, lhr];
    expect(routeCategories(route("a", "LAX", "SFO"), all, ["LAX"])).toEqual(["short", "domestic", "hub-spoke"]);
    expect(routeCategories(route("a", "SFO", "SAN"), all, ["LAX"])).toEqual(["short", "domestic", "point-to-point"]);
    expect(routeCategories(route("a", "LAX", "HNL"), new Map(all.map((a) => [a.id, a])))).toEqual(["long", "domestic", "point-to-point"]);
    expect(routeCategories(route("a", "SFO", "LHR"), all)[0]).toBe("long"); // about 8600 km
    expect(routeCategories(route("a", "HNL", "LHR"), all)).toContain("international");
    expect(routeCategories(route("a", "LAX", "NOPE"), all)).toEqual([]);
  });
});

describe("effective target load factor", () => {
  const r = route("r1", "LAX", "SFO");
  it("route target wins, else last matching policy, else none", () => {
    const ps = [policy("p1", { targetLoadFactor: 0.7 }), policy("p2", { targetLoadFactor: 0.8, scope: { routeIds: ["r1"] } })];
    expect(effectiveTargetLoadFactor({ ...r, targetLoadFactor: 0.6 }, ps)).toBe(0.6);
    expect(effectiveTargetLoadFactor(r, ps)).toBe(0.8);
    expect(effectiveTargetLoadFactor(route("r9", "LAX", "SAN"), ps)).toBe(0.7);
    expect(effectiveTargetLoadFactor(r, [])).toBeUndefined();
    expect(effectiveTargetLoadFactor(r, undefined)).toBeUndefined();
    // a later null-target policy switches the earlier target off
    expect(effectiveTargetLoadFactor(r, [policy("p1", { targetLoadFactor: 0.7 }), policy("p2")])).toBeUndefined();
  });
  it("category scopes need airports", () => {
    const ps = [policy("p1", { targetLoadFactor: 0.75, scope: { categories: ["short"] } })];
    expect(effectiveTargetLoadFactor(r, ps)).toBeUndefined();
    expect(effectiveTargetLoadFactor(r, ps, AIRPORTS)).toBe(0.75);
    expect(effectiveConnectionMarkdown(r, [policy("m", { connectionMarkdown: 0.2 })])).toBe(0.2);
  });
  it("the weekly step re-prices a route through a policy target but not one without", () => {
    const s = sim([route("r1", "LAX", "SFO")]);
    const withPolicy = applyCommand(s, { kind: "setFarePolicy", policy: policy("p", { targetLoadFactor: 0.6 }) }).state;
    expect(stepDay(withPolicy).world.routes[0]!.fares.Y).not.toBe(120);
    expect(stepDay(s).world.routes[0]!.fares.Y).toBe(120);
    const own = applyCommand(withPolicy, { kind: "updateRoute", id: "r1", patch: { targetLoadFactor: 0.9 } }).state;
    expect(stepDay(own).world.routes[0]!.fares.Y).not.toBe(stepDay(withPolicy).world.routes[0]!.fares.Y);
  });
});

describe("connection markdown", () => {
  const hubNet = () => startingScenario(airports, aircraftTypes, 2015);
  const conn = (s: ReturnType<typeof hubNet>) => stepDay(s).routeReports["route-2"]!;

  it("no policy, an empty list and a zero-markdown policy give identical results", () => {
    const base = JSON.stringify(runDays(hubNet(), 9).routeReports);
    expect(JSON.stringify(runDays({ ...hubNet(), world: { ...hubNet().world, farePolicies: [] } }, 9).routeReports)).toBe(base);
    const zero = applyCommand(hubNet(), { kind: "setFarePolicy", policy: policy("z") }).state;
    const a = runDays(zero, 9);
    expect(JSON.stringify(a.routeReports)).toBe(base);
    expect(JSON.stringify(a.snapshots)).toBe(JSON.stringify(runDays(hubNet(), 9).snapshots));
  });

  it("a markdown lowers revenue per connecting passenger by about that share and raises connecting traffic", () => {
    const base = conn(hubNet()).connecting!;
    const marked = conn(applyCommand(hubNet(), { kind: "setFarePolicy", policy: policy("m", { connectionMarkdown: 0.2 }) }).state).connecting!;
    expect(base.passengersOneWay).toBeGreaterThan(0);
    const perPax = (c: typeof base) => c.revenue / c.passengersOneWay;
    expect(perPax(marked) / perPax(base)).toBeLessThan(0.85);
    expect(perPax(marked) / perPax(base)).toBeGreaterThan(0.7);
    expect(marked.passengersOneWay).toBeGreaterThanOrEqual(base.passengersOneWay);
  });
});

describe("fare policy and terminal commands", () => {
  const s = sim([route("r1", "LAX", "SFO")]);
  it("adds, replaces and removes policies", () => {
    const a = applyCommand(s, { kind: "setFarePolicy", policy: policy("p", { connectionMarkdown: 0.1 }) });
    expect(a.result).toMatchObject({ ok: true, replaced: false });
    const b = applyCommand(a.state, { kind: "setFarePolicy", policy: policy("p", { connectionMarkdown: 0.3 }) });
    expect(b.result).toMatchObject({ ok: true, replaced: true });
    expect(b.state.world.farePolicies).toHaveLength(1);
    expect(applyCommand(b.state, { kind: "removeFarePolicy", id: "p" }).state.world.farePolicies).toEqual([]);
    expect(applyCommand(s, { kind: "removeFarePolicy", id: "zz" }).result).toMatchObject({ ok: false, error: "unknown_policy" });
  });
  it("rejects invalid policies", () => {
    const bad: Partial<FarePolicy>[] = [
      { targetLoadFactor: 0.4 }, { targetLoadFactor: 0.96 }, { targetLoadFactor: Number.NaN }, { connectionMarkdown: -0.1 }, { connectionMarkdown: 0.51 },
      { name: "" }, { id: "" }, { scope: { routeIds: ["nope"] } }, { scope: { categories: ["huge" as never] } },
    ];
    for (const b of bad) expect(applyCommand(s, { kind: "setFarePolicy", policy: policy("p", b) }).result).toMatchObject({ ok: false, error: "invalid_fare_policy" });
    for (const ok of [0.5, 0.95, null]) expect(applyCommand(s, { kind: "setFarePolicy", policy: policy("p", { targetLoadFactor: ok }) }).result.ok).toBe(true);
  });
  it("setHubTerminal validates airport and terminal, with the implicit MAIN terminal", () => {
    expect(applyCommand(s, { kind: "setHubTerminal", airportId: "XXX", terminalId: "MAIN" }).result).toMatchObject({ ok: false, error: "unknown_airport" });
    expect(applyCommand(s, { kind: "setHubTerminal", airportId: "LAX", terminalId: "T9" }).result).toMatchObject({ ok: false, error: "unknown_terminal" });
    const ok = applyCommand(s, { kind: "setHubTerminal", airportId: "LAX", terminalId: "MAIN" });
    expect(ok.result.ok).toBe(true);
    expect(ok.state.world.hubTerminals).toEqual({ LAX: "MAIN" });
    expect(applyCommand(ok.state, { kind: "setHubTerminal", airportId: "LAX", terminalId: "MAIN" }).result).toMatchObject({ ok: false, error: "no_change" });
  });
});

describe("hub congestion and slot fees", () => {
  const withTerminals = (): Airport[] => AIRPORTS.map((a) => a.id !== "LAX" ? a : ({
    ...a,
    terminals: [
      { id: "T1", name: "Terminal 1", feeMultiplier: 0.8, premium: false, slotShare: 0.6, source: "estimate: test" },
      { id: "TBIT", name: "Bradley", feeMultiplier: 2, premium: true, slotShare: 0.4, source: "estimate: test" },
    ],
  }));

  it("derives totals from slotsPerHour x 18 h x 7 and counts 2 slots per weekly round trip at each end", () => {
    const s = sim([route("r1", "LAX", "SFO", { weeklyFrequency: 10 }), route("r2", "LAX", "SAN", { weeklyFrequency: 5 })]);
    const c = hubCongestion(s, "LAX");
    expect(c.slotsPerWeekTotal).toBe(100 * 18 * 7);
    expect(c.slotsUsedByPlayer).toBe(30);
    expect(c.slotsUsedByAll).toBe(30 + backgroundSlots(7, AIRPORTS[0]!));
    expect(c.slotsAvailable).toBe(c.slotsPerWeekTotal - c.slotsUsedByAll);
    expect(c.terminals).toEqual([{ terminalId: "MAIN", slotsUsedByPlayer: 30, slotsCapacity: c.slotsPerWeekTotal, weeklyFeeUsd: 30 * 140 }]);
    expect(hubCongestion(s, "SFO").slotsUsedByPlayer).toBe(20);
    expect(hubCongestion(s, "HNL").slotsUsedByPlayer).toBe(0);
    expect(hubCongestion(s, "ZZZ").slotsPerWeekTotal).toBe(0);
  });

  it("is deterministic per seed and clamps availability at zero", () => {
    const s = sim([]);
    expect(hubCongestion(s, "OGG")).toEqual(hubCongestion(sim([]), "OGG"));
    const tiny = newSim(7, [{ ...AIRPORTS[4]!, slotsPerHour: 1 }, ...AIRPORTS.slice(0, 4)], AIRCRAFT_TYPES);
    tiny.world.routes = [route("r1", "OGG", "LAX", { weeklyFrequency: 70 })];
    expect(hubCongestion(tiny, "OGG").slotsAvailable).toBe(0);
    expect(weeklySlotsTotal(AIRPORTS[4]!)).toBe(20 * 18 * 7);
  });

  it("splits by terminal: default first non-premium, hubTerminals choice moves the player and its fee", () => {
    const s = newSim(7, withTerminals(), AIRCRAFT_TYPES, {}, { baseAirport: "LAX" });
    s.world.routes = [route("r1", "LAX", "SFO", { weeklyFrequency: 10 })];
    const d = hubCongestion(s, "LAX");
    expect(d.terminals.map((t) => [t.terminalId, t.slotsUsedByPlayer, t.slotsCapacity])).toEqual([["T1", 20, 7560], ["TBIT", 0, 5040]]);
    expect(d.terminals[0]!.weeklyFeeUsd).toBeCloseTo(20 * 140 * 0.8);
    const moved = applyCommand(s, { kind: "setHubTerminal", airportId: "LAX", terminalId: "TBIT" }).state;
    const m = hubCongestion(moved, "LAX");
    expect(m.terminals[1]!.slotsUsedByPlayer).toBe(20);
    expect(m.terminals[1]!.weeklyFeeUsd).toBeCloseTo(20 * 140 * 2);
    expect(weeklySlotFees(moved).total).toBeGreaterThan(weeklySlotFees(s).total);
  });

  it("charges the slot fees daily into costs and the cash identity stays exact", () => {
    const s = sim([route("r1", "LAX", "SFO", { weeklyFrequency: 10 })]);
    const fees = weeklySlotFees(s);
    expect(fees.line).toMatchObject({ key: "slotFees", label: "Slot and terminal fees", group: "cost" });
    expect(fees.total).toBeCloseTo(20 * 140 + 20 * 140);
    const free = { ...s, world: { ...s.world, routes: [] as Route[] } };
    expect(weeklySlotFees(free).total).toBe(0);
    const n = stepDay(s);
    expect(n.world.cash - s.world.cash).toBeCloseTo(n.snapshots[0]!.profit, 6);
    expect(n.snapshots[0]!.costs).toBeGreaterThan(fees.total / 7);
  });

  it("openRoute returns insufficient_slots with numbers once the notional fleet is off", () => {
    const small: Airport[] = AIRPORTS.map((a) => (a.id === "SFO" ? { ...a, slotsPerHour: 2 } : a)); // 252 slots, ~20% background
    const mk = (notional: boolean) => newSim(7, small, AIRCRAFT_TYPES, { notionalFleet: notional }, { baseAirport: "LAX", routes: [route("r1", "LAX", "SFO", { weeklyFrequency: 10 })] });
    // updateRoute runs the same validation as openRoute (an unchanged pair and type skips only the fleet check)
    const cmd = { kind: "updateRoute" as const, id: "r1", patch: { weeklyFrequency: 140 } };
    expect(applyCommand(mk(true), cmd).result.ok).toBe(true);
    const r = applyCommand(mk(false), cmd).result;
    expect(r).toMatchObject({ ok: false, error: "insufficient_slots" });
    if (!r.ok) expect(r.message).toMatch(/needs 280 slots a week at SFO; \d+ are available \(252 total/);
  });
});

describe("save compatibility", () => {
  it("fare policies and terminal choices round-trip and validate; old saves still validate", () => {
    let s = sim([route("r1", "LAX", "SFO")]);
    expect(validateSimState(JSON.parse(JSON.stringify(s)))).toEqual([]);
    s = applyCommand(s, { kind: "setFarePolicy", policy: policy("p", { targetLoadFactor: 0.8, connectionMarkdown: 0.1, scope: { categories: ["short"] } }) }).state;
    s = applyCommand(s, { kind: "setHubTerminal", airportId: "LAX", terminalId: "MAIN" }).state;
    const parsed = parseSave(stringifySave(makeSave(s, { appVersion: "t", savedAt: "2026-01-01T00:00:00Z" })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const loaded = parsed.save.state as typeof s;
    expect(loaded.world.farePolicies).toEqual(s.world.farePolicies);
    expect(loaded.world.hubTerminals).toEqual({ LAX: "MAIN" });
    expect(validateSimState(loaded)).toEqual([]);
    const damaged = JSON.parse(JSON.stringify(s));
    damaged.world.farePolicies = [{ id: 1 }];
    expect(validateSimState(damaged).length).toBeGreaterThan(0);
    expect(checkState(runDays(loaded, 8))).toEqual([]);
  });
});
