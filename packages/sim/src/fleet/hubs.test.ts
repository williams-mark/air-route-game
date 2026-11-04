import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Aircraft, Route } from "@arg/contracts";
import { applyCommand } from "../commands";
import { blockHoursPerFrequency, hubBlockHours, homeHubOf, routeHourSummary } from "./hubs";
import { assign, weeklyCapacityHours } from "./scheduler";
import { blockHours } from "../finance/ledger";
import { distanceKm } from "../geo";
import { makeSave, parseSave, stringifySave } from "../serialize";
import { startingScenario } from "../scenario";
import type { SimState } from "../state";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const sc = (seed = 7) => startingScenario(airports, aircraftTypes, seed);
const route = (id: string, o: string, d: string, freq: number, typeId: string): Route => ({ id, origin: o, destination: d, weeklyFrequency: freq, fares: { Y: 150 }, typeId });
const ac = (id: string, typeId: string, hubId?: string): Aircraft => ({
  id, typeId, tailNumber: `N${id}`, layout: { sections: [{ cls: "Y", rows: 20, seatsAcross: 6, pitchIn: 31 }] }, status: "active", ageDays: 100,
  hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 }, ...(hubId === undefined ? {} : { hubId }),
});

describe("block-hour math", () => {
  it("a round trip costs two one-way block hours per weekly frequency", () => {
    const t = T.get("B737-800")!;
    const km = distanceKm(A.get("LAX")!, A.get("SEA")!);
    expect(blockHoursPerFrequency(route("x", "LAX", "SFO", 1, "B737-800"), t, km)).toBeCloseTo(2 * blockHours(km, t), 9);
  });

  it("a hub's pool is its active aircraft of the type times the scheduler's weekly hours, less what routes already need", () => {
    const base = sc();
    const home = homeHubOf(base);
    expect(home).toBe("LAX");
    const pool = hubBlockHours(base, "LAX", "B737-800");
    const count = base.world.fleet.filter((x) => x.typeId === "B737-800" && x.status === "active").length;
    expect(pool.available).toBeCloseTo(count * weeklyCapacityHours(T.get("B737-800")!), 9);
    expect(pool.free).toBeCloseTo(pool.available - pool.used, 9);
    expect(hubBlockHours(base, "JFK", "B737-800").available).toBe(0);
  });

  it("routeHourSummary reports the needed hours of the proposed frequency against the origin hub", () => {
    const base = sc();
    const s = routeHourSummary(base, "LAX", "SEA", "B737-800", 5);
    const km = distanceKm(A.get("LAX")!, A.get("SEA")!);
    expect(s.needed).toBeCloseTo(5 * blockHoursPerFrequency({ origin: "LAX", destination: "SEA" }, T.get("B737-800")!, km), 9);
    expect(s.free).toBeCloseTo(s.available - s.used, 9);
  });
});

describe("hub isolation in the scheduler", () => {
  const types = T;
  it("an aircraft based at another hub does not fly a LAX route; the route is under-supplied", () => {
    const r = [route("r1", "LAX", "SFO", 3, "B737-800")];
    const jfk = assign(r, [ac("a1", "B737-800", "JFK")], { airports: A, types, homeHub: "LAX" });
    expect(jfk.routes.r1!.scheduledFrequency).toBe(0);
    expect(jfk.routes.r1!.underSupplied).toBe(3);
    expect(jfk.aircraft.a1!.blockHoursPerWeek).toBe(0);
  });

  it("an aircraft without a hubId is based at the home hub and flies the route", () => {
    const r = [route("r1", "LAX", "SFO", 3, "B737-800")];
    const home = assign(r, [ac("a1", "B737-800")], { airports: A, types, homeHub: "LAX" });
    expect(home.routes.r1!.scheduledFrequency).toBe(3);
    const other = assign(r, [ac("a1", "B737-800")], { airports: A, types, homeHub: "JFK" });
    expect(other.routes.r1!.scheduledFrequency).toBe(0);
  });

  it("a hub-based aircraft flies a route that touches its hub from either end", () => {
    const r = [route("r1", "SFO", "LAX", 2, "B737-800")];
    const res = assign(r, [ac("a1", "B737-800", "LAX")], { airports: A, types, homeHub: "LAX" });
    expect(res.routes.r1!.scheduledFrequency).toBe(2);
  });
});

describe("openRoute block-hour check", () => {
  it("refuses a frequency the origin hub cannot fly, with insufficient_block_hours and the needed and free hours", () => {
    const base = sc();
    const r = applyCommand(base, { kind: "openRoute", route: { origin: "LAX", destination: "SEA", weeklyFrequency: 140, fares: { Y: 150 }, typeId: "B737-800" } }).result;
    expect(r).toMatchObject({ ok: false, error: "insufficient_block_hours" });
    if (r.ok === false) {
      expect(r.message).toMatch(/needs \d+\.\d block hours a week from LAX/);
      expect(r.message).toMatch(/\d+\.\d are free there/);
    }
  });

  it("accepts a frequency within the free hours, and leaves the state unchanged when refused", () => {
    const base = sc();
    const ok = applyCommand(base, { kind: "openRoute", route: { origin: "LAX", destination: "SEA", weeklyFrequency: 1, fares: { Y: 150 }, typeId: "B737-800" } }).result;
    expect(ok.ok).toBe(true);
    const before = JSON.stringify(base.world.routes);
    applyCommand(base, { kind: "openRoute", route: { origin: "LAX", destination: "SEA", weeklyFrequency: 140, fares: { Y: 150 }, typeId: "B737-800" } });
    expect(JSON.stringify(base.world.routes)).toBe(before);
  });

  it("does not count the route being edited against the pool", () => {
    const base = sc();
    const opened = applyCommand(base, { kind: "openRoute", route: { origin: "LAX", destination: "SEA", weeklyFrequency: 1, fares: { Y: 150 }, typeId: "B737-800" } });
    const id = opened.result.ok ? opened.result.routeId : "";
    const pool = hubBlockHours(opened.state, "LAX", "B737-800", id);
    const full = Math.floor(pool.free / blockHoursPerFrequency({ origin: "LAX", destination: "SEA" }, T.get("B737-800")!, distanceKm(A.get("LAX")!, A.get("SEA")!)));
    const r = applyCommand(opened.state, { kind: "updateRoute", id, patch: { weeklyFrequency: full } }).result;
    expect(r.ok).toBe(true);
  });
});

describe("setAircraftHub", () => {
  it("moves an active aircraft to a hub airport", () => {
    const base = sc();
    const id = base.world.fleet[0]!.id;
    const r = applyCommand(base, { kind: "setAircraftHub", aircraftId: id, hubId: "SFO" });
    expect(r.result).toMatchObject({ ok: true, aircraftId: id, hubId: "SFO" });
    expect(r.state.world.fleet.find((x) => x.id === id)!.hubId).toBe("SFO");
  });

  it("rejects unknown aircraft, non-active aircraft and unknown hubs", () => {
    const base = sc();
    const id = base.world.fleet[0]!.id;
    expect(applyCommand(base, { kind: "setAircraftHub", aircraftId: "nope", hubId: "SFO" }).result).toMatchObject({ ok: false, error: "unknown_aircraft" });
    expect(applyCommand(base, { kind: "setAircraftHub", aircraftId: id, hubId: "ZZZ" }).result).toMatchObject({ ok: false, error: "unknown_airport" });
    const stored: SimState = { ...base, world: { ...base.world, fleet: base.world.fleet.map((x) => (x.id === id ? { ...x, status: "stored" as const } : x)) } };
    expect(applyCommand(stored, { kind: "setAircraftHub", aircraftId: id, hubId: "SFO" }).result).toMatchObject({ ok: false, error: "aircraft_unavailable" });
  });
});

describe("migration of saves without hubs", () => {
  it("an old save's aircraft are assigned to the home hub on load; the save version is unchanged", () => {
    const base = sc();
    const old: SimState = {
      ...base,
      world: { ...base.world, fleet: base.world.fleet.map(({ hubId: _h, ...rest }) => rest), homeHub: undefined },
      baseAirport: "LAX",
    };
    expect(old.world.fleet.every((x) => x.hubId === undefined)).toBe(true);
    const parsed = parseSave(stringifySave(makeSave(old, { appVersion: "t", savedAt: "x" })));
    if (!parsed.ok) throw new Error("load failed");
    expect(parsed.save.version).toBe(2);
    expect(parsed.save.state.world.fleet.every((x) => x.hubId === "LAX")).toBe(true);
  });

  it("a save from a non-LAX start keeps its home hub for aircraft without hubId", () => {
    const base = startingScenario(airports, aircraftTypes, 7, { hub: "SFO" });
    const noHub: SimState = { ...base, world: { ...base.world, fleet: base.world.fleet.map(({ hubId: _h, ...rest }) => rest), homeHub: undefined }, baseAirport: "SFO" };
    const parsed = parseSave(stringifySave(makeSave(noHub, { appVersion: "t", savedAt: "x" })));
    if (!parsed.ok) throw new Error("load failed");
    expect(parsed.save.state.world.fleet.every((x) => x.hubId === "SFO")).toBe(true);
  });
});

