import { describe, expect, it } from "vitest";
import type { AircraftType } from "@arg/contracts";
import { aircraftFamilyById, aircraftTypes, airportById } from "@arg/data";
import { DOUGLAS_GROUP, OTHERS, buildTree, compareFamilies, familyOf, manufacturerGroup, pathOf } from "./families";
import { availabilityOf, filterTypes, orderBlock, routeBlock, typicalSeats } from "./availability";

const mk = (id: string, manufacturer: string, name: string, maxSeats = 100, introYear = 2000) =>
  ({ id, manufacturer, name, rangeKm: 1000, cruiseKmh: 800, maxSeats, fuelBurnKgPerKm: 1, runwayNeededM: 2000, listPriceUsdM: 10, introYear, endYear: null, widebody: false }) as AircraftType;

describe("familyOf", () => {
  it("uses the data family table for every type in @arg/data", () => {
    for (const t of aircraftTypes) expect(familyOf(t), t.id).toBe(aircraftFamilyById[t.id]);
  });
  it("falls back to the type name without a table entry", () => {
    expect(familyOf({ id: "ZZ", name: "Zed One" }, {})).toBe("Zed One");
  });
  it("tree contains every type exactly once", () => {
    const tree = buildTree(aircraftTypes);
    const ids = tree.flatMap((m) => m.families.flatMap((f) => f.types.map((t) => t.id)));
    expect(ids.sort()).toEqual(aircraftTypes.map((t) => t.id).sort());
    const t = aircraftTypes[0]!;
    expect(pathOf(t)).toEqual([manufacturerGroup(t.manufacturer), familyOf(t)]);
  });
});

describe("manufacturer tiles and family order", () => {
  const types = [
    mk("b1", "Boeing", "Boeing 737-700"), mk("b2", "Boeing", "Boeing 747-400"), mk("b3", "Boeing", "Boeing 717-200"), mk("b4", "Boeing", "Boeing 707-320"), mk("b5", "Boeing", "Boeing 727-200"), mk("b6", "Boeing", "Boeing 737-800", 180),
    mk("a1", "Airbus", "Airbus A320"), mk("a2", "Airbus", "Airbus A300"),
    mk("d1", "Douglas", "Douglas DC-10"), mk("d2", "McDonnell Douglas", "MD-80"), mk("d3", "Douglas", "Douglas DC-9"), mk("d4", "McDonnell Douglas", "MD-11"), mk("d5", "Douglas", "Douglas DC-8"),
    mk("e1", "Embraer", "E175"), mk("c1", "Bombardier", "CRJ700"), mk("f1", "Fokker", "F100"),
  ];
  const table = { b1: "737", b6: "737", b2: "747", b3: "717", b4: "707", b5: "727", a1: "A320", a2: "A300", d1: "DC-10", d2: "MD-80", d3: "DC-9", d4: "MD-11", d5: "DC-8", e1: "E-Jet", c1: "CRJ", f1: "F100" };
  const tree = buildTree(types, table);
  it("groups makers: majors by type count, Douglas lineage merged, rest under Others last", () => {
    expect(tree.map((m) => m.manufacturer)).toEqual(["Boeing", "Douglas / McDonnell Douglas", "Airbus", "Others"]);
    expect(manufacturerGroup("McDonnell Douglas")).toBe(DOUGLAS_GROUP);
    expect(manufacturerGroup("ATR")).toBe(OTHERS);
  });
  it("orders families numerically", () => {
    expect(tree[0]!.families.map((f) => f.family)).toEqual(["707", "717", "727", "737", "747"]);
    expect(tree[1]!.families.map((f) => f.family)).toEqual(["DC-8", "DC-9", "DC-10", "MD-11", "MD-80"]);
    expect(tree[0]!.families[3]!.types.map((t) => t.id)).toEqual(["b1", "b6"]);
  });
  it("Others lists families by maker", () => {
    expect(tree[3]!.families.map((f) => f.manufacturer)).toEqual(["Bombardier", "Embraer", "Fokker"]);
  });
  it("compareFamilies handles numbers and prefixes", () => {
    expect(["A320", "A220", "A380", "A300"].sort(compareFamilies)).toEqual(["A220", "A300", "A320", "A380"]);
    expect(compareFamilies("DC-9", "DC-10")).toBeLessThan(0);
  });
});

describe("availability and filtering", () => {
  const t = (id: string) => aircraftTypes.find((x) => x.id === id)!;
  it("classifies production state by year", () => {
    expect(availabilityOf(t("B737-8"), 2015)).toBe("future");
    expect(availabilityOf(t("B737-8"), 2020)).toBe("current");
    expect(availabilityOf(t("B757-200"), 2010)).toBe("ended");
    expect(availabilityOf(t("B757-200"), 2000)).toBe("current");
  });
  it("blocks orders for ended and far-future types", () => {
    expect(orderBlock(t("B757-200"), 2015)).toMatch(/Out of production/);
    expect(orderBlock(t("B737-8"), 2015)).toBeNull();
    expect(orderBlock(t("A220-300"), 2010)).toMatch(/Orders open/);
  });
  it("route filter uses canFlyRoute", () => {
    const lax = airportById.get("LAX")!, hnl = airportById.get("HNL")!;
    expect(routeBlock(t("ATR72-600"), lax, hnl, 2020)).toMatch(/Range/);
    expect(routeBlock(t("B787-9"), lax, hnl, 2020)).toBeNull();
    const all = filterTypes(aircraftTypes, (x) => routeBlock(x, lax, hnl, 2020), true);
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThan(aircraftTypes.length);
    expect(filterTypes(aircraftTypes, (x) => routeBlock(x, lax, hnl, 2020), false)).toHaveLength(aircraftTypes.length);
  });
  it("typical seats never exceed max", () => {
    for (const x of aircraftTypes) { expect(typicalSeats(x)).toBeGreaterThan(0); expect(typicalSeats(x)).toBeLessThanOrEqual(x.maxSeats); }
  });
});
