import { describe, expect, it } from "vitest";
import type { Airport } from "@arg/contracts";
import { markerBudget, selectMarkers } from "./lod";

const ap = (id: string, lon: number, lat: number): Airport =>
  ({ id, name: id, city: id, lat, lon, region: "US", country: "US", landmass: "X", runwayM: 3000, metroPopulation: 1, gdpPerCapita: 1, tourismIndex: 0, slotsPerHour: 1 });
const proj = (lon: number, lat: number) => ({ x: lon * 10, y: lat * 10 });
const base = { project: proj, width: 1000, height: 1000, spacing: 20, budget: 100 };

describe("selectMarkers", () => {
  const airports = [ap("BIG", 10, 10), ap("NEAR", 11, 10), ap("FAR", 30, 10), ap("OFF", 500, 500)];
  const rank = new Map([["BIG", 0], ["NEAR", 1], ["FAR", 2], ["OFF", 3]]);
  it("keeps the more important of two overlapping markers and skips off-screen ones", () => {
    expect([...selectMarkers({ ...base, airports, rank })].sort()).toEqual(["BIG", "FAR"]);
  });
  it("lets priority airports win over rank", () => {
    expect(selectMarkers({ ...base, airports, rank, priority: new Set(["NEAR"]) }).has("BIG")).toBe(false);
  });
  it("respects the budget and zooming in reveals more", () => {
    expect(selectMarkers({ ...base, airports, rank, budget: 1 }).size).toBe(1);
    expect(selectMarkers({ ...base, airports, rank, project: (lo, la) => ({ x: lo * 100, y: la * 100 }), width: 5000 }).has("NEAR")).toBe(true);
  });
  it("scales to 600 airports", () => {
    const many = Array.from({ length: 600 }, (_, i) => ap(`A${i}`, (i % 30) * 0.3, Math.floor(i / 30) * 0.3));
    const r = new Map(many.map((a, i) => [a.id, i]));
    const t = performance.now();
    const kept = selectMarkers({ ...base, airports: many, rank: r, project: (lo, la) => ({ x: lo * 100, y: la * 100 }), width: 900, height: 600, spacing: 18, budget: 60 });
    expect(kept.size).toBeLessThanOrEqual(60);
    expect(performance.now() - t).toBeLessThan(100);
    expect(kept.has("A0")).toBe(true);
  });
  it("budget grows with zoom", () => {
    expect(markerBudget(2.2)).toBeGreaterThanOrEqual(14);
    expect(markerBudget(7)).toBeGreaterThan(markerBudget(4));
  });
});
