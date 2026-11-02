import { describe, expect, it, vi } from "vitest";
import { MockSimBridge, DAYS_PER_SECOND } from "./bridge";
import { formatDay } from "./format";

describe("MockSimBridge", () => {
  it("starts on day 0 and does not advance while paused", () => {
    const b = new MockSimBridge({ startPaused: true });
    b.advance(10_000);
    expect(b.getState().day).toBe(0);
    expect(b.getState().speed).toBe(0);
  });

  it("advances days according to speed, carrying fractions", () => {
    const b = new MockSimBridge();
    b.advance(500);
    expect(b.getState().day).toBe(0);
    b.advance(500);
    expect(b.getState().day).toBe(1);
    b.dispatch({ kind: "setSpeed", speed: 3 });
    b.advance(1000);
    expect(b.getState().day).toBe(1 + DAYS_PER_SECOND[3]);
  });

  it("notifies subscribers and gives a new snapshot on change only", () => {
    const b = new MockSimBridge();
    const fn = vi.fn();
    const off = b.subscribe(fn);
    const before = b.getState();
    b.setSpeed(1); // unchanged
    expect(fn).not.toHaveBeenCalled();
    b.setSpeed(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(b.getState()).not.toBe(before);
    off();
    b.setSpeed(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("releases the second decision on day 3 and resolves decisions", () => {
    const b = new MockSimBridge();
    expect(b.getState().decisions.map((d) => d.id)).toEqual(["kestrel-fares"]);
    b.setSpeed(3);
    b.advance(1000);
    expect(b.getState().decisions).toHaveLength(2);
    b.decide("kestrel-fares", "hold");
    expect(b.getState().decisions.map((d) => d.id)).toEqual(["launch-discount"]);
  });

  it("tracks a 30-day profit window", () => {
    const b = new MockSimBridge();
    b.setSpeed(5);
    b.advance(2000);
    const s = b.getState();
    expect(s.profitSeries).toHaveLength(30);
    expect(s.profit30).toBe(s.profitSeries.reduce((a, c) => a + c, 0));
  });
});

describe("formatDay", () => {
  it("formats the campaign start and later dates", () => {
    expect(formatDay(0)).toBe("Thu 1 Jan 2015");
    expect(formatDay(31)).toBe("Sun 1 Feb 2015");
  });
});

describe("MockSimBridge route commands", () => {
  const draft = { origin: "LAX", destination: "SFO", weeklyFrequency: 7, fares: { Y: 120 }, typeId: "B737-800" };
  it("opens, updates and closes routes with typed results", () => {
    const b = new MockSimBridge({ startPaused: true });
    const res = b.dispatch({ kind: "openRoute", route: draft });
    expect(res).toMatchObject({ ok: true, routeId: "LAX-SFO" });
    expect(b.getState().routes).toHaveLength(1);
    expect(b.dispatch({ kind: "openRoute", route: draft })).toMatchObject({ ok: false, error: { code: "duplicate_route" } });
    expect(b.dispatch({ kind: "updateRoute", id: "LAX-SFO", patch: { weeklyFrequency: 14 } })).toMatchObject({ ok: true });
    expect(b.getState().routes[0]!.weeklyFrequency).toBe(14);
    expect(b.dispatch({ kind: "updateRoute", id: "LAX-SFO", patch: { weeklyFrequency: 0 } })).toMatchObject({ ok: false, error: { code: "bad_frequency" } });
    expect(b.dispatch({ kind: "closeRoute", id: "LAX-SFO" })).toMatchObject({ ok: true });
    expect(b.getState().routes).toHaveLength(0);
    expect(b.dispatch({ kind: "closeRoute", id: "LAX-SFO" })).toMatchObject({ ok: false, error: { code: "unknown_route" } });
  });
});
