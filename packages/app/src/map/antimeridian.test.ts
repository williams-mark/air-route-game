import { describe, expect, it } from "vitest";
import land from "./land.json";
import { splitAtAntimeridian, splitPolygon } from "./antimeridian";

type Ring = number[][];
const rings = (fc: { features: { geometry: { type: string; coordinates: unknown } }[] }): Ring[] =>
  fc.features.flatMap((f) => {
    const g = f.geometry;
    const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
    return polys.flatMap((p) => p);
  });
const jumps = (r: Ring) => r.some((p, i) => i > 0 && Math.abs(p[0]! - r[i - 1]![0]!) > 180);

describe("splitting land at the 180th meridian", () => {
  it("splits a square that crosses 180 into an east and a west part", () => {
    const sq = [[[170, 60], [-170, 60], [-170, 70], [170, 70], [170, 60]]];
    const parts = splitPolygon(sq);
    expect(parts).toHaveLength(2);
    const lons = parts.map((p) => p[0]!.map((c) => c[0]!));
    expect(Math.min(...lons[0]!)).toBe(170);
    expect(Math.max(...lons[0]!)).toBe(180);
    expect(Math.min(...lons[1]!)).toBe(-180);
    expect(Math.max(...lons[1]!)).toBe(-170);
  });

  it("leaves a polygon that does not cross untouched", () => {
    const sq = [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]];
    expect(splitPolygon(sq)).toEqual([sq]);
  });

  it("leaves no ring in the bundled land that jumps across the globe", () => {
    const fc = land as never as Parameters<typeof rings>[0];
    expect(rings(fc).some(jumps)).toBe(true);
    const fixed = splitAtAntimeridian(fc as never) as typeof fc;
    expect(rings(fixed).filter(jumps)).toHaveLength(0);
    for (const r of rings(fixed)) for (const p of r) expect(Math.abs(p[0]!)).toBeLessThanOrEqual(180);
  });
});
