import { describe, expect, it } from "vitest";
import { dayRecord } from "./finance";

describe("dayRecord", () => {
  it("books the world field's indirect cost under sales, not as fleet cost", () => {
    const snap = { day: 1, cash: 0, revenue: 1000, costs: 600, profit: 400 };
    const r = dayRecord(snap, {}, 10, 20, 155);
    expect(r.by.sales).toBe(155);
    expect(r.by.fleet).toBe(600 - 10 - 20 - 155);
    expect(Object.values(r.by).reduce((t, x) => t + x, 0)).toBeCloseTo(600);
  });
});
