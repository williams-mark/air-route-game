import { describe, expect, it, vi } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { dayToDate, startingScenario } from "@arg/sim";
import { RealSimBridge, classifyNotice, trimNotices } from "./realBridge";
import { createBridge } from "./create";
import { monthly } from "./finance";

const make = (o: ConstructorParameters<typeof RealSimBridge>[0] = {}) => new RealSimBridge({ startPaused: true, ...o });
// Origin LAX: the fleet is LAX-based, so the block-hour pool at LAX covers it (an SFO origin would be refused).
const draft = { origin: "LAX", destination: "SEA", weeklyFrequency: 1, fares: { Y: 110 }, typeId: "B737-800" };

describe("RealSimBridge", () => {
  it("the campaign review pauses the game on its end date, is shown once, and Keep playing carries on", () => {
    const base = startingScenario(airports, aircraftTypes, 7, { campaignYears: 15 });
    const b = make({ initial: { ...base, campaign: { ...base.campaign!, endDay: base.world.day + 2 } }, startPaused: false });
    expect(b.getState().review).toBeNull();
    b.stepDays(2);
    const due = b.getState();
    expect(due.speed).toBe(0);
    expect(due.review).not.toBeNull();
    expect(due.review!.fleetCount).toBe(8);
    b.stepDays(3);
    expect(b.getState().day).toBe(due.day);
    b.dispatch({ kind: "continueEndless" });
    expect(b.getState().review).toBeNull();
    b.setSpeed(1);
    b.stepDays(3);
    expect(b.getState().day).toBe(due.day + 3);
    expect(b.getState().review).toBeNull();
  });

  it("starts with the four-route scenario and 150M cash", () => {
    const s = make().getState();
    expect(s.routes).toHaveLength(4);
    expect(s.cash).toBe(150_000_000);
    expect(s.day).toBe(0);
    expect(s.speed).toBe(0);
    expect(s.fleet).toHaveLength(8);
    expect(s.airline).toEqual({ name: "Skybridge Pacific", hub: "LAX" });
  });

  it("newGame with a hub and name starts a game there, and dispatches the new error codes with clear messages", () => {
    const b = make();
    b.newGame(7, { hub: "FRA", name: "Rhein Test" });
    b.dispatch({ kind: "setSpeed", speed: 0 });
    const s = b.getState();
    expect(s.airline).toEqual({ name: "Rhein Test", hub: "FRA" });
    expect(s.routes.length).toBeGreaterThanOrEqual(3);
    expect(s.routes.every((r) => r.origin === "FRA")).toBe(true);
    expect(s.notices.some((n) => /Rhein Test/.test(n.text))).toBe(true);
    const closed = b.dispatch({ kind: "openRoute", route: { origin: "FRA", destination: "BER", weeklyFrequency: 7, fares: { Y: 120 }, typeId: "B737-800" } });
    expect(closed).toMatchObject({ ok: false, error: { code: "airport_closed" } });
    expect(closed && !closed.ok && closed.error.message).toMatch(/BER/);
    const water = b.dispatch({ kind: "openRoute", route: { origin: "SYD", destination: "AKL", weeklyFrequency: 7, fares: { Y: 300 }, typeId: "E175" } });
    expect(water).toMatchObject({ ok: false, error: { code: "overwater_limit" } });
  });

  it("newGame with a start year starts in that year, with a fleet in production then, and orders only what is in production", () => {
    const b = make();
    b.newGame(7, { hub: "LAX", name: "Pacific Test", startYear: 1975, presentYear: 2026 });
    const s = b.getState();
    expect(s.day).toBeLessThan(0);
    expect(dayToDate(s.day).year).toBe(1975);
    expect(s.fleet.every((a) => a.typeId === "DC10-30")).toBe(true);
    const bad = b.dispatch({ kind: "orderAircraft", typeId: "B737-800", count: 1, layout: { sections: [] } });
    expect(bad).toMatchObject({ ok: false, error: { code: "type_unavailable" } });
    const ok = b.dispatch({ kind: "orderAircraft", typeId: "DC10-30", count: 1, layout: { sections: [] } });
    expect(ok).toMatchObject({ ok: true });
  });

  it("advances date and changes cash over 30 days, with one snapshot per advance", () => {
    const b = make();
    b.dispatch({ kind: "setSpeed", speed: 5 });
    const fn = vi.fn();
    b.subscribe(fn);
    fn.mockClear();
    const before = b.getState().cash;
    // 250 ms at 30 days/s is 7 days: stepped in one batch, announced once.
    expect(b.advance(250)).toBe(7);
    expect(fn).toHaveBeenCalledTimes(1);
    b.stepDays(23);
    const s = b.getState();
    expect(s.day).toBe(30);
    expect(s.cash).not.toBe(before);
    expect(s.ledger).toHaveLength(30);
    expect(s.profitSeries).toHaveLength(30);
    expect(s.profit30).toBeCloseTo(s.cash - before, 0);
    expect(Object.keys(s.reports)).toHaveLength(4);
  });

  it("bounds the days stepped per frame however long the frame was", () => {
    const b = make();
    b.setSpeed(5);
    expect(b.advance(60_000)).toBeLessThanOrEqual(8);
  });

  it("does not advance while paused", () => {
    const b = make();
    expect(b.advance(5000)).toBe(0);
    expect(b.getState().day).toBe(0);
  });

  it("opens a route through dispatch and maps errors to typed codes", () => {
    const b = make();
    const res = b.dispatch({ kind: "openRoute", route: draft });
    expect(res).toMatchObject({ ok: true, routeId: "route-5" });
    expect(b.getState().routes).toHaveLength(5);
    expect(b.dispatch({ kind: "openRoute", route: draft })).toMatchObject({ ok: false, error: { code: "duplicate_route" } });
    expect(b.dispatch({ kind: "openRoute", route: { ...draft, destination: "XXX" } })).toMatchObject({ ok: false, error: { code: "unknown_airport" } });
    expect(b.dispatch({ kind: "updateRoute", id: "route-5", patch: { weeklyFrequency: 0 } })).toMatchObject({ ok: false, error: { code: "invalid_frequency" } });
    expect(b.dispatch({ kind: "closeRoute", id: "route-5" })).toMatchObject({ ok: true });
    expect(b.getState().routes).toHaveLength(4);
    expect(b.getState().notices[0]!.text).toContain("Closed");
  });

  it("an order creates delivery-status aircraft, takes the deposit and lists delivery dates", () => {
    const b = make();
    const cash = b.getState().cash;
    const res = b.dispatch({ kind: "orderAircraft", typeId: "A320N", count: 3, layout: { sections: [] } });
    expect(res).toMatchObject({ ok: true });
    const s = b.getState();
    expect(s.fleet).toHaveLength(11);
    const onOrder = s.fleet.filter((a) => a.status === "delivery");
    expect(onOrder).toHaveLength(3);
    for (const a of onOrder) expect(a.deliveryDay).toBeGreaterThan(0);
    expect(s.orders).toHaveLength(1);
    expect(s.orders[0]).toMatchObject({ typeId: "A320N", count: 3, delivered: 0 });
    expect(s.cash).toBeLessThan(cash);
    expect(b.dispatch({ kind: "orderAircraft", typeId: "NOPE", count: 1, layout: { sections: [] } })).toMatchObject({ ok: false, error: { code: "unknown_type" } });
    expect(b.dispatch({ kind: "orderAircraft", typeId: "B757-200", count: 1, layout: { sections: [] } })).toMatchObject({ ok: false, error: { code: "type_unavailable" } });
    expect(b.dispatch({ kind: "orderAircraft", typeId: "B787-9", count: 200, layout: { sections: [] } })).toMatchObject({ ok: false, error: { code: "credit_limit" } });
  });

  it("same seed gives identical state after 60 days; a different seed differs", () => {
    const a = make({ seed: 7 }), b = make({ seed: 7 }), c = make({ seed: 8 });
    for (const x of [a, b, c]) x.stepDays(60);
    expect(a.getState().cash).toBe(b.getState().cash);
    expect(a.getState().ledger).toEqual(b.getState().ledger);
    expect(a.simState.routeReports).toEqual(b.simState.routeReports);
    expect(a.getState().cash).not.toBe(c.getState().cash);
  });

  it("delivers ordered aircraft without pausing and raises a delivery card", () => {
    const b = new RealSimBridge({ startPaused: false });
    const res = b.dispatch({ kind: "orderAircraft", typeId: "A320N", count: 1, layout: { sections: [] } });
    expect(res).toMatchObject({ ok: true });
    const due = Math.min(...b.getState().orders[0]!.deliveryDays);
    b.setSpeed(5);
    let guard = 0;
    while (b.getState().day <= due && guard++ < 5000) {
      if (b.getState().speed === 0) b.setSpeed(5); // the player resumes after each pause
      b.advance(250);
    }
    const s = b.getState();
    expect(s.fleet.filter((a) => a.status === "delivery")).toHaveLength(0);
    expect(s.notices.some((n) => /Delivered/.test(n.text) && n.severity === "good")).toBe(true);
    expect(s.decisions.some((d) => d.id.startsWith("delivery-"))).toBe(true);
    // Deliveries no longer slow or pause the clock (owner request): the player's speed 5 is kept.
    expect(s.notices.some((n) => /Slowed|Paused/.test(n.text))).toBe(false);
    expect(s.speed).toBe(5);
  });

  // Low-load and rival fare-cut cards were removed by owner request: an overpriced route raises no card and no pause.
  it("raises no low-load card and does not pause on a decision", () => {
    const b = new RealSimBridge({ seed: 2015, startPaused: false });
    b.dispatch({ kind: "updateRoute", id: b.getState().routes.find((r) => r.destination === "SAN")!.id, patch: { fares: { Y: 160 } } });
    b.setSpeed(2);
    for (let i = 0; i < 400; i++) b.advance(250);
    expect(b.getState().decisions.filter((d) => !d.id.startsWith("delivery-"))).toEqual([]);
    expect(b.getState().speed).toBe(2);
  });

  it("rolls daily records up into calendar months", () => {
    const b = make();
    b.stepDays(70);
    const m = monthly(b.getState().ledger);
    expect(m.map((x) => x.label)).toEqual(["Jan 2015", "Feb 2015", "Mar 2015"]);
    expect(m[0]!.days).toBe(31);
    const total = m.reduce((s, x) => s + x.profit, 0);
    expect(total).toBeCloseTo(b.getState().ledger.reduce((s, r) => s + r.profit, 0), 3);
    for (const x of m) expect(Object.values(x.by).reduce((s, v) => s + v, 0)).toBeCloseTo(x.costs, 3);
  });
});

describe("bridge selection and notices", () => {
  it("uses the real sim by default and the mock with ?mock=1", () => {
    const real = createBridge("?paused");
    expect(real.getState().routes).toHaveLength(4);
    const mock = createBridge("?mock=1&paused");
    expect(mock.getState().routes.length).toBeGreaterThan(10);
    (real as { stop?: () => void }).stop?.();
    (mock as { stop?: () => void }).stop?.();
  });
  it("classifies sim wording", () => {
    expect(classifyNotice("LAX-SAN is under-supplied: 3 of 7")).toBe("warn");
    expect(classifyNotice("Delivered N014SP (A320N).")).toBe("good");
    expect(aircraftTypes.length).toBeGreaterThan(10);
  });
});

describe("trimNotices", () => {
  const n = (id: number, severity: string) => ({ id, severity });
  it("drops routine notices before alerts when over the limit", () => {
    const list = [n(5, "info"), n(4, "info"), n(3, "alert"), n(2, "info"), n(1, "info")];
    expect(trimNotices(list, 3).map((x) => x.id)).toEqual([5, 4, 3]);
    expect(trimNotices(list, 2).map((x) => x.id)).toEqual([5, 3]);
  });
  it("keeps the newest when everything is an alert, and leaves short lists alone", () => {
    expect(trimNotices([n(3, "alert"), n(2, "alert"), n(1, "alert")], 2).map((x) => x.id)).toEqual([3, 2]);
    const short = [n(2, "info"), n(1, "alert")];
    expect(trimNotices(short, 5)).toEqual(short);
  });
});

describe("distress and bankruptcy in the bridge", () => {
  const broke = (cash: number) => {
    const b = make();
    const sim = b.simState;
    return new RealSimBridge({ startPaused: true, initial: { ...sim, world: { ...sim.world, cash } } });
  };

  it("reports the credit line, raises an alert on distress and the monthly alert text mentions the line", () => {
    const b = broke(-200_000_000);
    expect(b.getState().credit?.limitUsd).toBeGreaterThan(0);
    b.stepDays(1);
    const s = b.getState();
    expect(s.credit?.distress?.daysLeft).toBe(90);
    expect(s.notices.some((n) => n.severity === "alert" && /Financial distress/.test(n.text))).toBe(true);
  });

  it("stops the clock at bankruptcy, keeps it stopped and refuses to resume", () => {
    const b = broke(-300_000_000);
    b.setSpeed(5);
    b.advance(250);
    for (let i = 0; i < 12 && !b.getState().credit?.bankrupt; i++) b.advance(250);
    expect(b.getState().credit?.bankrupt).not.toBeNull();
    const day = b.getState().day;
    expect(b.getState().speed).toBe(0);
    b.setSpeed(3);
    expect(b.getState().speed).toBe(0);
    b.advance(1000);
    expect(b.getState().day).toBe(day);
    // One ledger row per simulated day, no duplicates from the frozen state.
    expect(b.getState().ledger.length).toBe(day);
    expect(b.dispatch({ kind: "closeRoute", id: "route-1" })).toMatchObject({ ok: false, error: { code: "bankrupt" } });
  });

  it("books overdraft interest in its own ledger column", () => {
    const b = broke(-20_000_000);
    b.stepDays(40);
    const m = monthly(b.getState().ledger);
    expect(m.reduce((a, x) => a + x.by.interest, 0)).toBeGreaterThan(0);
    const l = b.getState().ledger;
    for (const r of l) expect(Object.values(r.by).reduce((a, x) => a + x, 0)).toBeCloseTo(r.costs, 2);
  });

  it("sells an owned aircraft through the bridge once it is off its routes: cash up, fleet down; a flying one is refused", () => {
    const b = make({ seed: 11 });
    expect(b.dispatch({ kind: "orderAircraft", typeId: "A320", count: 1, layout: { sections: [] }, financing: "purchase" })).toMatchObject({ ok: true });
    for (let i = 0; i < 40 && !b.getState().fleet.some((a) => a.holding === "purchase" && a.status === "active"); i++) b.stepDays(30);
    const mine = b.getState().fleet.find((a) => a.holding === "purchase" && a.status === "active")!;
    expect(mine).toBeDefined();
    // Starting-fleet aircraft pay the lease-equivalent: they are returned, not sold.
    const leased = b.getState().fleet.find((a) => a.holding === "lease" && a.status === "active")!;
    expect(b.dispatch({ kind: "sellAircraft", aircraftId: leased.id })).toMatchObject({ ok: false, error: { code: "leased_aircraft" } });
    // With the network closed nothing flies, so the owned aircraft can go.
    for (const r of b.getState().routes) b.dispatch({ kind: "closeRoute", id: r.id });
    const cash = b.getState().cash, n = b.getState().fleet.length;
    expect(b.dispatch({ kind: "sellAircraft", aircraftId: mine.id })).toMatchObject({ ok: true });
    expect(b.getState().cash).toBeGreaterThan(cash);
    expect(b.getState().fleet).toHaveLength(n - 1);
    expect(b.dispatch({ kind: "returnLease", aircraftId: leased.id })).toMatchObject({ ok: true });
    expect(b.getState().fleet).toHaveLength(n - 2);
    b.stepDays(5);
    for (const r of b.getState().ledger) expect(Object.values(r.by).reduce((a, x) => a + x, 0)).toBeCloseTo(r.costs, 2);
  });

  it("refuses to sell an aircraft that flies a route, naming the route", () => {
    const b = make({ seed: 11 });
    b.stepDays(3);
    const flying = b.getState().fleet.find((a) => a.routes.length > 0)!;
    expect(flying).toBeDefined();
    const res = b.dispatch({ kind: flying.holding === "purchase" ? "sellAircraft" : "returnLease", aircraftId: flying.id });
    expect(res).toMatchObject({ ok: false, error: { code: "aircraft_on_route" } });
    expect(res && !res.ok && res.error.message).toMatch(/first/);
  });

  it("classifies the credit notices", () => {
    expect(classifyNotice("Financial distress: cash -$300.0M")).toBe("alert");
    expect(classifyNotice("Bankruptcy: cash stayed beyond")).toBe("alert");
    expect(classifyNotice("Distress over: cash")).toBe("good");
  });
});
