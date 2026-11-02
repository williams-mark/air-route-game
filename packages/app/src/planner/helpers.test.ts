import { describe, expect, it } from "vitest";
import { AXIS_H, GROUP_H, ROW_H, axisTicks, barRect, buildSegments, cabinSummary, dayX, layoutRows, makeScale, money, routeSlot, xDay } from "./helpers";

const win = (kind: "B" | "C" | "D" | "refit", startDay: number, endDay: number) => ({ kind, startDay, endDay, underway: false, latestStartDay: startDay + 30 });

describe("timeline scale", () => {
  it("maps days to pixels and back, with a minimum pixel density", () => {
    const sc = makeScale(100, 130, 900);
    expect(sc.pxPerDay).toBe(30);
    expect(dayX(sc, 110)).toBe(300);
    expect(xDay(sc, 305)).toBe(110);
    const wide = makeScale(0, 365, 800);
    expect(wide.pxPerDay).toBe(3);
    expect(wide.width).toBe(1095);
  });

  it("clips bars to the visible range and keeps a minimum width", () => {
    const sc = makeScale(100, 200, 1000);
    expect(barRect(sc, 90, 110)).toEqual({ x: 0, w: 100 });
    expect(barRect(sc, 190, 260)).toEqual({ x: 900, w: 100 });
    expect(barRect(sc, 210, 230)).toBeNull();
    expect(barRect(sc, 50, 99)).toBeNull();
    expect(barRect(sc, 150, 150)!.w).toBe(2); // zero-length marker still shows
  });

  it("chooses weekly, fortnightly or monthly ticks by span", () => {
    const date = (d: number) => ({ year: 2015, month: Math.floor(d / 30) % 12, dayOfMonth: (d % 30) + 1 });
    expect(axisTicks(makeScale(0, 30, 600), date).length).toBeGreaterThanOrEqual(4);
    expect(axisTicks(makeScale(0, 365, 600), date).every((t) => t.major)).toBe(true);
  });
});

describe("segments", () => {
  const base = { from: 0, to: 100, today: 10, delivery: null, baseRoute: "r1", pins: [] as never[], windows: [] as never[] };
  it("starts at today and covers the horizon with one flying stretch", () => {
    expect(buildSegments(base)).toEqual([{ start: 10, end: 100, kind: "fly", routeId: "r1", pinned: false }]);
  });
  it("splits around a check and marks a time-boxed pin", () => {
    const s = buildSegments({ ...base, windows: [win("C", 30, 51)], pins: [{ routeId: "r2", fromDay: 60, toDay: 69 }] });
    expect(s.map((x) => [x.kind, x.start, x.end, x.routeId, x.pinned])).toEqual([
      ["fly", 10, 30, "r1", false], ["check", 30, 51, null, false], ["fly", 51, 60, "r1", false], ["fly", 60, 70, "r2", true], ["fly", 70, 100, "r1", false],
    ]);
  });
  it("shows the wait for delivery and drops the route for aircraft not yet in service", () => {
    const s = buildSegments({ ...base, delivery: 40, baseRoute: null });
    expect(s[0]).toMatchObject({ kind: "pre", start: 10, end: 40 });
    expect(s[1]).toMatchObject({ kind: "fly", start: 40, routeId: null });
  });
  it("a standing pin overrides the flown route throughout", () => {
    expect(buildSegments({ ...base, pins: [{ routeId: "r3" }] })).toEqual([{ start: 10, end: 100, kind: "fly", routeId: "r3", pinned: true }]);
  });
});

describe("rows and formatting", () => {
  it("lays out group headers and aircraft rows, hiding collapsed groups", () => {
    const groups = [{ key: "A320", items: ["a", "b"] }, { key: "B777", items: ["c"] }];
    const open = layoutRows(groups, new Set());
    expect(open.rows.map((r) => r.kind)).toEqual(["group", "aircraft", "aircraft", "group", "aircraft"]);
    expect(open.height).toBe(2 * GROUP_H + 3 * ROW_H);
    const shut = layoutRows(groups, new Set(["A320"]));
    expect(shut.rows.map((r) => r.kind)).toEqual(["group", "group", "aircraft"]);
    expect(shut.rows[1]!.y).toBe(GROUP_H);
    expect(AXIS_H).toBeGreaterThan(0);
  });
  it("formats money, cabin and route colour slots", () => {
    expect(money(312_175)).toBe("+$312k");
    expect(money(-1_500_000)).toBe("-$1.5M");
    expect(cabinSummary({ sections: [{ cls: "J", rows: 4, seatsAcross: 4 }, { cls: "Y", rows: 20, seatsAcross: 6 }] })).toBe("J16 Y120");
    expect(routeSlot(["a", "b"], "b")).toBe(1);
    expect(routeSlot(["a"], null)).toBe(-1);
  });
});
