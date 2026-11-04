import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Route } from "@arg/contracts";
import { applyCommand, defaultLayout, drainEvents, newSim, orderDiscount, runDays, startingScenario, stepDay } from "./index";

const spec = (o: string, d: string, typeId: string, freq = 7, y = 150): Omit<Route, "id"> => ({
  origin: o, destination: d, weeklyFrequency: freq, fares: { Y: y }, typeId,
});
const sc = () => startingScenario(airports, aircraftTypes, 1);
const type = (id: string) => aircraftTypes.find((t) => t.id === id)!;
const months = (days: number) => days / 30.4375;

describe("setSpeed", () => {
  it("stores the speed in state", () => {
    const { state, result } = applyCommand(sc(), { kind: "setSpeed", speed: 3 });
    expect(result).toEqual({ ok: true, kind: "setSpeed", speed: 3 });
    expect(state.speed).toBe(3);
  });
  it("rejects values outside 0..5", () => {
    const r = applyCommand(sc(), { kind: "setSpeed", speed: 9 as 5 });
    expect(r.result.ok).toBe(false);
    expect(r.state.speed).toBe(0);
  });
});

describe("openRoute", () => {
  it("opens a valid route, assigns an id, queues a notice and does not mutate the input", () => {
    const s0 = sc();
    const before = JSON.stringify(s0);
    const { state, result } = applyCommand(s0, { kind: "openRoute", route: spec("LAX", "SJC", "B737-800", 14, 90) });
    expect(JSON.stringify(s0)).toBe(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routeId).toMatch(/^route-/);
    expect(state.world.routes).toHaveLength(5);
    expect(new Set(state.world.routes.map((r) => r.id)).size).toBe(5);
    const { events, state: drained } = drainEvents(state);
    expect(events.some((e) => e.kind === "notice" && e.text.includes("LAX-SJC"))).toBe(true);
    expect(drained.pendingEvents).toEqual([]);
  });

  it.each([
    [spec("LAX", "XXX", "B737-800"), "unknown_airport"],
    [spec("LAX", "LAX", "B737-800"), "same_airport"],
    [spec("LAX", "SJC", "A999"), "unknown_type"],
    [spec("LAX", "SJC", "B737-800", 0), "invalid_frequency"],
    [spec("LAX", "SJC", "B737-800", 7, -5), "invalid_fare"],
    [spec("LAX", "SFO", "B737-800"), "duplicate_route"],
    [spec("SFO", "LAX", "B737-800"), "duplicate_route"],
    [spec("SFO", "HNL", "E175"), "out_of_range"],
    [spec("LAX", "LUP", "B737-800"), "runway_too_short"],
  ])("rejects %j with %s", (route, code) => {
    const { state, result } = applyCommand(sc(), { kind: "openRoute", route });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(code);
    expect(result.message.length).toBeGreaterThan(10);
    expect(state.world.routes).toHaveLength(4);
  });

  it("needs a suitable aircraft in the fleet, and warns when only a substitute exists", () => {
    const empty = newSim(1, airports, aircraftTypes);
    const r0 = applyCommand(empty, { kind: "openRoute", route: spec("LAX", "SJC", "B737-800") }).result;
    expect(r0.ok === false && r0.error).toBe("no_suitable_aircraft");
    // The starting fleet has an A320 but no 737-900ER: no block hours of that type at LAX, so no substitution (refused).
    const r1 = applyCommand(sc(), { kind: "openRoute", route: spec("LAX", "SJC", "B737-900ER", 7, 90) }).result;
    expect(r1).toMatchObject({ ok: false, error: "insufficient_block_hours" });
  });
});

describe("updateRoute / closeRoute", () => {
  it("patches frequency and fares, validates the result", () => {
    const s0 = sc();
    const id = s0.world.routes[0]!.id;
    const ok = applyCommand(s0, { kind: "updateRoute", id, patch: { weeklyFrequency: 21, fares: { Y: 99 } } });
    expect(ok.result.ok).toBe(true);
    expect(ok.state.world.routes[0]).toMatchObject({ id, weeklyFrequency: 21, fares: { Y: 99 }, origin: "LAX" });
    const bad = applyCommand(s0, { kind: "updateRoute", id, patch: { typeId: "E175", destination: "KOA" } });
    expect(bad.result.ok === false && bad.result.error).toBe("out_of_range");
    expect(bad.state.world.routes[0]!.destination).toBe("SFO");
    expect(applyCommand(s0, { kind: "updateRoute", id: "nope", patch: {} }).result.ok).toBe(false);
  });

  it("closes a route and drops its report", () => {
    let s = runDays(sc(), 2);
    const id = s.world.routes[1]!.id;
    expect(s.routeReports[id]).toBeDefined();
    const r = applyCommand(s, { kind: "closeRoute", id });
    s = r.state;
    expect(r.result.ok).toBe(true);
    expect(s.world.routes.find((x) => x.id === id)).toBeUndefined();
    expect(s.routeReports[id]).toBeUndefined();
    expect(applyCommand(s, { kind: "closeRoute", id }).result.ok === false).toBe(true);
  });
});

describe("orderAircraft", () => {
  const order = (s = sc(), typeId = "B737-8", count = 4) =>
    applyCommand(s, { kind: "orderAircraft", typeId, count, layout: aircraftTypes.some((t) => t.id === typeId) ? defaultLayout(type(typeId)) : { sections: [] } });

  it("creates delivery-status aircraft, pays the deposit, and quotes a discount rising with size", () => {
    const s0 = sc();
    const { state, result } = order(s0, "B737-8", 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.world.fleet.filter((a) => a.status === "delivery")).toHaveLength(4);
    expect(state.world.cash).toBeCloseTo(s0.world.cash - result.depositUsd, 3);
    expect(result.depositUsd).toBeCloseTo(0.15 * 4 * result.unitPriceUsd, 3);
    expect(orderDiscount(1)).toBeLessThan(orderDiscount(10));
    expect(orderDiscount(10)).toBeLessThan(orderDiscount(100));
    expect(orderDiscount(10000)).toBeLessThanOrEqual(0.4);
    const small = order(s0, "B737-8", 1).result;
    expect(small.ok && small.discount).toBeLessThan(result.discount);
  });

  it("delivery lead times: narrowbodies 6-18 months, widebodies 12-30 months; deterministic", () => {
    for (const [id, lo, hi] of [["B737-900ER", 6, 18], ["B787-9", 12, 30], ["A321", 6, 18], ["B777-300ER", 12, 30]] as const) {
      const r = order(sc(), id, 3).result;
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const d of r.deliveryDays) {
        expect(months(d), id).toBeGreaterThanOrEqual(lo - 0.05);
        expect(months(d), id).toBeLessThanOrEqual(hi + 0.05);
      }
      expect(JSON.stringify(order(sc(), id, 3).result)).toBe(JSON.stringify(r));
    }
    // different seeds give different lead times
    const a = order(startingScenario(airports, aircraftTypes, 1), "B737-900ER", 1).result;
    const b = order(startingScenario(airports, aircraftTypes, 2), "B737-900ER", 1).result;
    expect(a.ok && b.ok && a.deliveryDays[0] !== b.deliveryDays[0]).toBe(true);
  });

  it("aircraft stay in 'delivery' (not scheduled, no lease) until the delivery day, then become active", () => {
    let { state: s, result } = order(sc(), "B737-8", 1);
    if (!result.ok) throw new Error("order failed");
    const id = result.aircraftIds[0]!;
    const due = result.deliveryDays[0]!;
    s = runDays(s, due);
    expect(s.world.fleet.find((a) => a.id === id)!.status).toBe("delivery");
    expect(s.world.fleet.find((a) => a.id === id)!.ageDays).toBe(0);
    const prev = s;
    s = stepDay(s);
    const ac = s.world.fleet.find((a) => a.id === id)!;
    expect(ac.status).toBe("active");
    expect(s.pendingEvents.some((e) => e.kind === "notice" && e.text.includes(ac.tailNumber) && e.text.includes("Delivered"))).toBe(true);
    // deposit credited back on delivery day (cash change that day exceeds the day's operating loss by about the deposit)
    const credit = result.depositUsd;
    expect(s.world.cash - prev.world.cash - s.snapshots[s.snapshots.length - 1]!.profit).toBeCloseTo(credit, 0);
  });

  it("a type not yet in service (737 MAX 8, 2017) cannot be delivered before its introduction year", () => {
    const r = order(sc(), "B737-8", 2).result;
    expect(r.ok).toBe(true);
    if (r.ok) expect(Math.min(...r.deliveryDays)).toBeGreaterThanOrEqual(730);
  });

  it("rejects bad orders", () => {
    const s = sc();
    const code = (r: ReturnType<typeof order>["result"]) => (r.ok ? "ok" : r.error);
    expect(code(order(s, "NOPE", 1).result)).toBe("unknown_type");
    expect(code(order(s, "B737-8", 0).result)).toBe("invalid_count");
    expect(code(order(s, "B737-8", 1.5).result)).toBe("invalid_count");
    expect(code(order(s, "B757-200", 1).result)).toBe("type_unavailable"); // production ended 2004
    expect(code(order(s, "B787-9", 100).result)).toBe("insufficient_cash");
    const tooBig = applyCommand(s, {
      kind: "orderAircraft", typeId: "B737-8", count: 1,
      layout: { sections: [{ cls: "Y", rows: 60, seatsAcross: 6, pitchIn: 28 }] },
    }).result;
    expect(code(tooBig)).toBe("invalid_layout");
    expect(s.world.fleet).toHaveLength(8);
  });
});
