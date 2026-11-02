import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { formatSummary, runBatch } from "./runner";

describe("balance bots", () => {
  it("20 short seeded games across all strategies: no crashes, no exploits, deterministic", () => {
    const a = runBatch(airports, aircraftTypes, 20, { years: 0.5 });
    expect(a.crashes.map((c) => c.crash)).toEqual([]);
    expect(a.exploits).toEqual([]);
    expect(a.results).toHaveLength(20);
    for (const r of a.results) {
      expect(Number.isFinite(r.finalCash)).toBe(true);
      expect(r.finalCash).toBeLessThan(5 * 150e6); // half a year cannot multiply the cash
    }
    console.log(formatSummary(a));
    const b = runBatch(airports, aircraftTypes, 6, { years: 0.25 });
    const c = runBatch(airports, aircraftTypes, 6, { years: 0.25 });
    expect(b.results.map((r) => r.finalCash)).toEqual(c.results.map((r) => r.finalCash));
  }, 120_000);
});
