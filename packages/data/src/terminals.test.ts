import { describe, expect, it } from "vitest";
import { terminalsByAirport, terminalsFor } from "./index.js";

describe("terminals", () => {
  for (const [ap, list] of Object.entries(terminalsByAirport)) {
    it(`${ap} is consistent`, () => {
      expect(list.length).toBeGreaterThan(1);
      expect(new Set(list.map((t) => t.id)).size).toBe(list.length);
      const sum = list.reduce((s, t) => s + t.slotShare, 0);
      expect(sum).toBeGreaterThanOrEqual(0.95);
      expect(sum).toBeLessThanOrEqual(1.05);
      for (const t of list) {
        expect(t.feeMultiplier).toBeGreaterThanOrEqual(0.5);
        expect(t.feeMultiplier).toBeLessThanOrEqual(2.0);
        expect(t.source.length).toBeGreaterThan(0);
        expect(t.premium).toBe(t.feeMultiplier > 1.15);
      }
    });
  }
  it("terminalsFor falls back to empty; LAX TBIT premium, MSC not", () => {
    expect(terminalsFor("ZZZ")).toEqual([]);
    const lax = terminalsFor("LAX");
    expect(lax.find((t) => t.id === "TBIT")?.premium).toBe(true);
    expect(lax.find((t) => t.id === "MSC")?.premium).toBe(false);
  });
});
