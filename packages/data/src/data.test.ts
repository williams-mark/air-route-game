import { describe, expect, it } from "vitest";
import { aircraftTypes, airportById, airports, canFlyDistance, distanceKm } from "./index.js";

const ap = (id: string) => {
  const a = airportById.get(id);
  if (!a) throw new Error(`missing ${id}`);
  return a;
};
const ac = (id: string) => {
  const t = aircraftTypes.find((x) => x.id === id);
  if (!t) throw new Error(`missing ${id}`);
  return t;
};

describe("airports", () => {
  it("distances are sane", () => {
    expect(distanceKm(ap("LAX"), ap("HNL"))).toBeGreaterThan(4000);
    expect(distanceKm(ap("LAX"), ap("HNL"))).toBeLessThan(4200);
    expect(Math.abs(distanceKm(ap("LAX"), ap("SFO")) - 543)).toBeLessThan(10);
    expect(distanceKm(ap("LAX"), ap("LAX"))).toBe(0);
  });
  it("ids unique, regions and bounds valid", () => {
    expect(new Set(airports.map((a) => a.id)).size).toBe(airports.length);
    for (const a of airports) {
      expect(["CA", "HI"]).toContain(a.region);
      if (a.region === "CA") {
        expect(a.lat).toBeGreaterThan(32.4); expect(a.lat).toBeLessThan(42.1);
        expect(a.lon).toBeGreaterThan(-124.5); expect(a.lon).toBeLessThan(-114.1);
      } else {
        expect(a.lat).toBeGreaterThan(18.8); expect(a.lat).toBeLessThan(22.3);
        expect(a.lon).toBeGreaterThan(-160.3); expect(a.lon).toBeLessThan(-154.7);
      }
      expect(a.runwayM).toBeGreaterThan(500);
      expect(a.tourismIndex).toBeGreaterThanOrEqual(0); expect(a.tourismIndex).toBeLessThanOrEqual(1);
      expect(a.metroPopulation).toBeGreaterThan(0); expect(a.slotsPerHour).toBeGreaterThan(0);
    }
  });
});

describe("aircraft", () => {
  it("ids unique and years ordered", () => {
    expect(new Set(aircraftTypes.map((t) => t.id)).size).toBe(aircraftTypes.length);
    for (const t of aircraftTypes) if (t.endYear !== null) expect(t.introYear).toBeLessThanOrEqual(t.endYear);
  });
  it("widebody flag consistent with seats", () => {
    for (const t of aircraftTypes) {
      if (t.widebody) expect(t.maxSeats).toBeGreaterThanOrEqual(300);
      else expect(t.maxSeats).toBeLessThanOrEqual(250);
    }
  });
  it("range feasibility", () => {
    const d = distanceKm(ap("LAX"), ap("HNL"));
    expect(canFlyDistance(ac("B787-9"), d)).toBe(true);
    expect(canFlyDistance(ac("ATR72-600"), d)).toBe(false);
    expect(canFlyDistance(ac("CRJ900"), d)).toBe(false);
    // NOTE: A220-100 published range (~6,100 km) exceeds LAX-HNL; by range alone it CAN fly it (no operator does; ETOPS/economics).
    expect(canFlyDistance(ac("A220-100"), d)).toBe(true);
  });
});
