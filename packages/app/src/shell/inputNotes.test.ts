import { describe, expect, it } from "vitest";
import { fareNote, fitWhole } from "./inputNotes";

const notes = { high: "Max 84/wk", low: "Minimum 1 a week" };

describe("fitWhole", () => {
  it("uses a whole number in range as typed, with no note", () => {
    expect(fitWhole(12, 1, 84, notes)).toEqual({ value: 12, note: null });
  });

  it("clamps a huge frequency to the cap and says so", () => {
    expect(fitWhole(1e9, 1, 84, notes)).toEqual({ value: 84, note: "Max 84/wk" });
  });

  it("rounds 2.5 to 3 and says whole numbers only", () => {
    expect(fitWhole(2.5, 1, 84, notes)).toEqual({ value: 3, note: "Whole numbers only." });
  });

  it("raises zero and negative values to the minimum with a note", () => {
    expect(fitWhole(0, 1, 84, notes)).toEqual({ value: 1, note: "Minimum 1 a week" });
    expect(fitWhole(-5, 1, 84, notes)).toEqual({ value: 1, note: "Minimum 1 a week" });
  });

  it("clamps a typed load factor below its range and gives the range message", () => {
    const lf = { high: "Target must be 30-98%", low: "Target must be 30-98%" };
    expect(fitWhole(-10, 30, 98, lf)).toEqual({ value: 30, note: "Target must be 30-98%" });
    expect(fitWhole(120, 30, 98, lf)).toEqual({ value: 98, note: "Target must be 30-98%" });
  });

  it("asks for a number when the field is not numeric", () => {
    expect(fitWhole(Number.NaN, 30, 98, notes).note).toMatch(/whole number from 30 to 98/);
  });
});

describe("fareNote", () => {
  it("is silent for blank and usable whole fares", () => {
    expect(fareNote("")).toBeNull();
    expect(fareNote("  ")).toBeNull();
    expect(fareNote("249")).toBeNull();
  });

  it("flags zero, negative, fractional and non-numeric fares", () => {
    expect(fareNote("0")).toMatch(/above \$0/);
    expect(fareNote("-40")).toMatch(/above \$0/);
    expect(fareNote("99.5")).toBe("Whole dollars only: $100 is used.");
    expect(fareNote("abc")).toMatch(/dollar amount/);
  });
});
