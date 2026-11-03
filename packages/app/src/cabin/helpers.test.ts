import { aircraftTypes } from "@arg/data";
import { defaultLayout, suggestLayouts } from "@arg/sim";
import { describe, expect, it } from "vitest";
import { arrangementParts, conform, fillEconomy, issues, lengthShares, maxRowsFor, newSection, projectRoute, sectionOf, setSection, signed, usd } from "./helpers";
import { airports } from "@arg/data";
import { validateCabinLayout } from "@arg/sim";
import { typicalSeats } from "../aircraft/availability";

const T = (id: string) => aircraftTypes.find((t) => t.id === id)!;
const a350 = T("A350-900"), a320 = T("A320");

describe("cabin helpers", () => {
  it("adds, edits and removes sections in front-to-back order", () => {
    let l = defaultLayout(a350);
    l = setSection(l, "F", newSection(a350, "F"), a350);
    expect(l.sections.map((s) => s.cls)).toEqual(["F", "J", "W", "Y"]);
    l = setSection(l, "J", { rows: 3 });
    expect(sectionOf(l, "J")!.rows).toBe(3);
    l = setSection(l, "W", null);
    expect(sectionOf(l, "W")).toBeUndefined();
  });
  it("parses arrangements", () => { expect(arrangementParts("2-4-2")).toEqual([2, 4, 2]); expect(arrangementParts("3-3")).toEqual([3, 3]); });
  it("computes proportions that sum to 1", () => {
    const s = lengthShares(defaultLayout(a350));
    expect(s.F + s.J + s.W + s.Y).toBeCloseTo(1, 10);
  });
  it("fills economy within length and the seat maximum", () => {
    const l = fillEconomy(a320, suggestLayouts(a320)[1]!.layout);
    expect(issues(a320, l).errors).toEqual([]);
    expect(sectionOf(l, "Y")!.rows).toBeGreaterThanOrEqual(sectionOf(suggestLayouts(a320)[1]!.layout, "Y")!.rows - 1);
    expect(maxRowsFor(a320, l, "Y")).toBeGreaterThanOrEqual(sectionOf(l, "Y")!.rows);
  });
  it("conforms a layout when the type changes", () => {
    const l = conform(a320, suggestLayouts(a350)[2]!.layout);
    expect(l.sections.every((s) => s.seatsAcross <= 6)).toBe(true);
  });
  it("projects revenue and flags infeasible routes", () => {
    const ok = projectRoute(a350, defaultLayout(a350), "LAX", "HNL", airports, aircraftTypes, 100);
    expect(ok.feasible).toBe(true);
    expect(ok.revenuePerFlight).toBeGreaterThan(0);
    const bad = projectRoute(T("ATR72-600"), defaultLayout(T("ATR72-600")), "LAX", "HNL", airports, aircraftTypes, 100);
    expect(bad.feasible).toBe(false);
  });
  it("formats", () => { expect(usd(1_500_000)).toBe("$1.50M"); expect(usd(-2500)).toBe("-$3k"); expect(signed(1.234)).toBe("+1.2"); expect(signed(-1)).toBe("-1.0"); });
});

describe("opening the designer", () => {
  it("never changes the default cabin of any type, and matches the seats the type picker advertises", () => {
    for (const t of aircraftTypes) {
      const d = defaultLayout(t);
      expect(validateCabinLayout(t, d).ok, t.id).toBe(true);
      expect(conform(t, d), t.id).toEqual(d);
      expect(layoutSeatsOf(conform(t, d)), t.id).toBe(typicalSeats(t));
    }
  });
});
const layoutSeatsOf = (l: { sections: Array<{ rows: number; seatsAcross: number }> }) => l.sections.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
