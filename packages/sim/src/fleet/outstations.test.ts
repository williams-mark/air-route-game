import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Route } from "@arg/contracts";
import { applyCommand, COMMAND_PARAMS } from "../commands";
import { basesOf, blockHoursPerFrequency, isBase, isOutstation, isOwnedHub, OUTSTATION_PARAMS, outstationBlockHours, outstationsOf } from "./hubs";
import { distanceKm } from "../geo";
import { makeSave, parseSave, stringifySave } from "../serialize";
import { startingScenario } from "../scenario";
import type { SimState } from "../state";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const sc = () => startingScenario(airports, aircraftTypes, 7);
const withOutstation = (s: SimState, id: string) => applyCommand(s, { kind: "openOutstation", airportId: id }).state;
/** Notional fleet: block-hour pools and slots are not checked, so only the outstation cap can refuse a route. */
const notional = (s: SimState): SimState => ({ ...s, params: { ...s.params, notionalFleet: true } });
const hoursPerFreq = (o: string, d: string, typeId = "B737-800") => blockHoursPerFrequency({ origin: o, destination: d }, T.get(typeId)!, distanceKm(A.get(o)!, A.get(d)!));
const spec = (o: string, d: string, weeklyFrequency: number): Omit<Route, "id"> => ({ origin: o, destination: d, weeklyFrequency, fares: { Y: 150 }, typeId: "B737-800" });

describe("openOutstation", () => {
  it("costs USD 10M, records the payment, and makes the airport a base but not a hub", () => {
    const base = sc();
    const r = applyCommand(base, { kind: "openOutstation", airportId: "SFO" });
    expect(r.result).toMatchObject({ ok: true, kind: "openOutstation", airportId: "SFO", costUsd: 10_000_000 });
    expect(COMMAND_PARAMS.outstationUsd).toBe(OUTSTATION_PARAMS.costUsd);
    expect(r.state.world.cash).toBe(base.world.cash - 10_000_000);
    expect(r.state.world.cashLog?.at(-1)).toMatchObject({ amountUsd: -10_000_000, text: expect.stringContaining("SFO") });
    expect(outstationsOf(r.state)).toEqual(["SFO"]);
    expect(isOutstation(r.state, "SFO")).toBe(true);
    expect(isOwnedHub(r.state, "SFO")).toBe(false);
    expect(basesOf(r.state)).toEqual(["LAX", "SFO"]);
    expect(base.outstations).toBeUndefined(); // input untouched
  });

  it("refuses a hub, an existing outstation, an unknown airport, and a player without the cash", () => {
    const base = sc();
    expect(applyCommand(base, { kind: "openOutstation", airportId: "LAX" }).result).toMatchObject({ ok: false, error: "already_hub" });
    expect(applyCommand(withOutstation(base, "SFO"), { kind: "openOutstation", airportId: "SFO" }).result).toMatchObject({ ok: false, error: "already_outstation" });
    expect(applyCommand(base, { kind: "openOutstation", airportId: "ZZZ" }).result).toMatchObject({ ok: false, error: "unknown_airport" });
    const poor: SimState = { ...base, world: { ...base.world, cash: 9_000_000 } };
    const r = applyCommand(poor, { kind: "openOutstation", airportId: "SFO" });
    expect(r.result).toMatchObject({ ok: false, error: "insufficient_cash" });
    expect(r.state).toBe(poor);
  });

  it("aircraft can be based at an outstation and new aircraft delivered there", () => {
    const s = withOutstation(sc(), "SEA");
    const id = s.world.fleet[0]!.id;
    const moved = applyCommand(s, { kind: "setAircraftHub", aircraftId: id, hubId: "SEA" });
    expect(moved.result).toMatchObject({ ok: true, hubId: "SEA" });
    const o = applyCommand(s, { kind: "orderAircraft", typeId: "B737-800", count: 1, layout: { sections: [] }, deliveryHubId: "SEA" });
    expect(o.result.ok).toBe(true);
    // still refused where there is neither
    expect(applyCommand(s, { kind: "setAircraftHub", aircraftId: id, hubId: "PDX" }).result).toMatchObject({ ok: false, error: "not_a_hub" });
  });

  it("making an outstation a hub removes it from the outstations (no cap any more)", () => {
    const s = withOutstation(sc(), "SFO");
    const up = applyCommand(s, { kind: "unlockHub", airportId: "SFO" }).state;
    expect(isOwnedHub(up, "SFO")).toBe(true);
    expect(outstationsOf(up)).toEqual([]);
    expect(isBase(up, "SFO")).toBe(true);
  });

  it("survives a save and load", () => {
    const s = withOutstation(sc(), "SFO");
    const parsed = parseSave(stringifySave(makeSave(s, { appVersion: "t", savedAt: "x" })));
    if (!parsed.ok) throw new Error("load failed");
    expect(outstationsOf(parsed.save.state)).toEqual(["SFO"]);
  });
});

describe("outstation block-hour cap", () => {
  it("counts the round-trip block hours of every route touching the airport, at either end", () => {
    const s = withOutstation(sc(), "SFO");
    const mine = s.world.routes.filter((r) => r.origin === "SFO" || r.destination === "SFO");
    const expected = mine.reduce((t, r) => t + r.weeklyFrequency * hoursPerFreq(r.origin, r.destination, r.typeId), 0);
    const h = outstationBlockHours(s, "SFO");
    expect(h.available).toBe(500);
    expect(h.used).toBeCloseTo(expected, 6);
    expect(h.free).toBeCloseTo(500 - expected, 6);
  });

  it("refuses a route that would take the outstation past 500 block hours a week, from either end, and allows one that fits", () => {
    const s = notional(withOutstation(sc(), "SEA"));
    const per = hoursPerFreq("SEA", "ORD");
    const fits = Math.floor(500 / per);
    expect(applyCommand(s, { kind: "openRoute", route: spec("SEA", "ORD", fits) }).result.ok).toBe(true);
    const over = applyCommand(s, { kind: "openRoute", route: spec("SEA", "ORD", fits + 1) });
    expect(over.result).toMatchObject({ ok: false, error: "outstation_full" });
    expect(over.state).toBe(s);
    // destination end counts too
    expect(applyCommand(s, { kind: "openRoute", route: spec("ORD", "SEA", fits + 1) }).result).toMatchObject({ ok: false, error: "outstation_full" });
  });

  it("an edited route is checked against the cap without counting itself twice", () => {
    const s0 = notional(withOutstation(sc(), "SEA"));
    const per = hoursPerFreq("SEA", "ORD");
    const opened = applyCommand(s0, { kind: "openRoute", route: spec("SEA", "ORD", 10) });
    if (!opened.result.ok) throw new Error(opened.result.message);
    const id = opened.result.routeId;
    const fits = Math.floor(500 / per);
    expect(applyCommand(opened.state, { kind: "updateRoute", id, patch: { weeklyFrequency: fits } }).result.ok).toBe(true);
    expect(applyCommand(opened.state, { kind: "updateRoute", id, patch: { weeklyFrequency: fits + 1 } }).result).toMatchObject({ ok: false, error: "outstation_full" });
  });

  it("a hub has no such cap", () => {
    const s = notional(applyCommand(sc(), { kind: "unlockHub", airportId: "SEA" }).state);
    const per = hoursPerFreq("SEA", "ORD");
    expect(applyCommand(s, { kind: "openRoute", route: spec("SEA", "ORD", Math.ceil(600 / per)) }).result.ok).toBe(true);
  });
});
