import { describe, expect, it } from "vitest";
import { aircraftTypes, airportById, airports, canFlyDistance, canFlyRoute, distanceKm, isOverwaterRoute, maxOverwaterKm } from "./index.js";

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
    // A220-100 published range (~6,300 km) exceeds LAX-HNL.
    expect(canFlyDistance(ac("A220-100"), d)).toBe(true);
  });
});

describe("overwater / canFlyRoute", () => {
  const can = (t: string, a: string, b: string) => canFlyRoute(ac(t), ap(a), ap(b));
  it("every type has an overwater limit", () => {
    for (const t of aircraftTypes) expect(maxOverwaterKm[t.id]).toBeGreaterThan(0);
  });
  it("overwater classification", () => {
    expect(isOverwaterRoute(ap("LAX"), ap("HNL"))).toBe(true);
    expect(isOverwaterRoute(ap("HNL"), ap("OGG"))).toBe(true);
    expect(isOverwaterRoute(ap("HNL"), ap("JRF"))).toBe(false); // same island
    expect(isOverwaterRoute(ap("LAX"), ap("SFO"))).toBe(false);
  });
  it("A220 is NOT barred from LAX-HNL: ETOPS 180 (Transport Canada, Jan 2019) + 6,300 km range; Airbus cited Honolulu-LA as an A220 route", () => {
    expect(can("A220-100", "LAX", "HNL")).toBe(true);
    expect(can("A220-300", "SFO", "OGG")).toBe(true);
  });
  it("narrowbody ETOPS-180 twins reach Hawaii from CA", () => {
    for (const t of ["B737-8", "B737-800", "A321N", "B757-200"]) expect(can(t, "LAX", "HNL")).toBe(true);
  });
  it("regional types cannot cross to Hawaii but can hop between islands", () => {
    for (const t of ["E175", "CRJ900", "CRJ700", "ATR72-600"]) expect(can(t, "LAX", "HNL")).toBe(false);
    for (const t of ["CRJ900", "ATR72-600"]) expect(can(t, "HNL", "OGG")).toBe(true);
    expect(can("ATR72-600", "HNL", "LIH")).toBe(true);
  });
  it("runway at both ends is enforced", () => {
    expect(ap("LUP").runwayM).toBeLessThan(1300);
    expect(can("B737-8", "HNL", "LUP")).toBe(false);
    expect(can("ATR72-600", "HNL", "LUP")).toBe(false); // ATR needs ~1.1 km; Kalaupapa is ~0.8 km
    expect(can("ATR72-600", "HNL", "MKK")).toBe(true);
  });
  it("four-engine and widebody twins are not overwater-limited on CA-HI", () => {
    expect(can("B777-300ER", "LAX", "HNL")).toBe(true);
    expect(can("B787-9", "SFO", "HNL")).toBe(true);
  });
});
