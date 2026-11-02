import { describe, expect, it } from "vitest";
import { dayToDate, fractionalYear } from "./calendar";

describe("calendar", () => {
  it("day 0 is Thursday 2015-01-01", () => {
    expect(dayToDate(0)).toMatchObject({ year: 2015, month: 0, dayOfMonth: 1, weekday: 3 });
  });
  it("handles leap years", () => {
    expect(dayToDate(365 + 366 + 31 + 28)).toMatchObject({ year: 2017, month: 2, dayOfMonth: 1 });
    // 2016-02-29 = 365 + 31 + 28
    expect(dayToDate(365 + 31 + 28)).toMatchObject({ year: 2016, month: 1, dayOfMonth: 29 });
  });
  it("2025-12-31 is the last campaign day", () => {
    const last = 11 * 365 + 3 /* leap 2016, 2020, 2024 */ - 1;
    const d = dayToDate(last);
    expect(d.year).toBe(2025);
    expect(d.month).toBe(11);
    expect(d.dayOfMonth).toBe(31);
  });
  it("fractionalYear grows", () => {
    expect(fractionalYear(0)).toBeCloseTo(2015.001, 2);
    expect(fractionalYear(182)).toBeGreaterThan(2015.49);
  });
});
