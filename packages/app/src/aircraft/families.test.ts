import { describe, expect, it } from "vitest";
import { aircraftTypes, airportById } from "@arg/data";
import { FAMILY_BY_ID, buildTree, familyOf, pathOf } from "./families";
import { availabilityOf, filterTypes, orderBlock, routeBlock, typicalSeats } from "./availability";

describe("familyOf", () => {
  it("maps every aircraft type in @arg/data to an explicit family", () => {
    for (const t of aircraftTypes) expect(FAMILY_BY_ID[t.id], t.id).toBeTruthy();
    for (const t of aircraftTypes) expect(familyOf(t)).toBe(FAMILY_BY_ID[t.id]);
  });
  it("has no stale ids in the table", () => {
    const ids = new Set(aircraftTypes.map((t) => t.id));
    for (const id of Object.keys(FAMILY_BY_ID)) expect(ids.has(id), id).toBe(true);
  });
  it("groups as the owner expects", () => {
    const get = (id: string) => familyOf(aircraftTypes.find((t) => t.id === id)!);
    expect(get("CRJ900")).toBe("CRJ family");
    expect(get("B737-9")).toBe("737 MAX");
    expect(get("B737-800")).toBe("737 NG");
    expect(get("A321N")).toBe("A320 family");
    expect(get("B747-400")).toBe("747");
  });
  it("tree contains every type exactly once", () => {
    const tree = buildTree(aircraftTypes);
    const ids = tree.flatMap((m) => m.families.flatMap((f) => f.types.map((t) => t.id)));
    expect(ids.sort()).toEqual(aircraftTypes.map((t) => t.id).sort());
    expect(tree.map((m) => m.manufacturer)).toEqual(expect.arrayContaining(["Airbus", "Boeing", "Bombardier", "Embraer", "ATR"]));
    const boeing = tree.find((m) => m.manufacturer === "Boeing")!;
    expect(boeing.families.map((f) => f.family)).toEqual(["737 NG", "737 MAX", "757", "767", "777", "787", "747"]);
    const t = aircraftTypes[0]!;
    expect(pathOf(t)).toEqual([t.manufacturer, familyOf(t)]);
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
