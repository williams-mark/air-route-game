import { describe, expect, it } from "vitest";
import { displayLon, routePath, unwrapPath } from "./geo";

describe("antimeridian handling", () => {
  it("moves western Aleutian longitudes to the Americas side", () => {
    expect(displayLon(174.1, 52.7)).toBeCloseTo(-185.9);
    expect(displayLon(-149.99, 61.17)).toBe(-149.99);
    expect(displayLon(139.7, 35.5)).toBe(139.7); // Tokyo: not an Aleutian
  });
  it("route paths never jump by more than 180 degrees", () => {
    const p = routePath(displayLon(174.1, 52.7), 52.7, -149.99, 61.17, 36);
    for (let i = 1; i < p.length; i++) expect(Math.abs(p[i]![0] - p[i - 1]![0])).toBeLessThan(30);
    expect(p[0]![0]).toBeCloseTo(-185.9, 0);
  });
  it("unwraps a raw path that crosses +-180", () => {
    const u = unwrapPath([[170, 0], [179, 0], [-179, 0], [-170, 0]], 170);
    expect(u.map((q) => q[0])).toEqual([170, 179, 181, 190]);
  });
  it("transatlantic arc stays west to east and bows north", () => {
    const p = routePath(-73.8, 40.6, -0.45, 51.47, 36);
    expect(p[0]![0]).toBeCloseTo(-73.8, 0);
    expect(p[35]![0]).toBeCloseTo(-0.45, 0);
    expect(Math.max(...p.map((q) => q[1]))).toBeGreaterThan(51.5);
  });
});
