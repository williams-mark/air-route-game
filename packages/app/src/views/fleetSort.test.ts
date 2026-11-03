import { describe, expect, it } from "vitest";
import type { FleetItem } from "../sim/bridge";
import { compareByStatus, compareByType, groupLabel, sortFleet } from "./fleetSort";

const mk = (tail: string, typeId: string, typeName: string, status: FleetItem["status"], ageYears = 3): FleetItem =>
  ({ id: tail, tail, typeId, typeName, status, ageYears, seats: 150, routes: [] });
const fleet = [
  mk("N5", "B787-9", "787-9", "stored"), mk("N1", "B737-800", "737-800", "active"), mk("N2", "A320", "A320", "delivery"),
  mk("N3", "B737-8", "737 MAX 8", "maintenance"), mk("N4", "A321", "A321", "active", 1), mk("N10", "A320", "A320", "active", 9),
];

describe("fleet sort", () => {
  it("type: manufacturer, family, type name, tail", () => {
    expect(sortFleet(fleet, "type", "asc").map((a) => a.tail)).toEqual(["N2", "N10", "N4", "N1", "N3", "N5"]);
  });
  it("type descending reverses", () => {
    expect(sortFleet(fleet, "type", "desc").map((a) => a.tail)).toEqual(["N5", "N3", "N1", "N4", "N10", "N2"]);
  });
  it("status: active first, then maintenance, delivery, stored", () => {
    const s = sortFleet(fleet, "status", "asc").map((a) => a.status);
    expect(s).toEqual(["active", "active", "active", "maintenance", "delivery", "stored"]);
    expect(sortFleet(fleet, "status", "desc")[0]!.status).toBe("stored");
  });
  it("status ties break by type then tail", () => {
    expect(compareByStatus(fleet[4]!, fleet[1]!)).toBeLessThan(0); // A321 before 737-800
  });
  it("default keeps the original attention order (maintenance first)", () => {
    expect(sortFleet(fleet, "default", "asc")[0]!.status).toBe("maintenance");
  });
  it("tail is numeric aware and age sorts youngest first", () => {
    expect(sortFleet(fleet, "tail", "asc").map((a) => a.tail)).toEqual(["N1", "N2", "N3", "N4", "N5", "N10"]);
    expect(sortFleet(fleet, "age", "asc")[0]!.tail).toBe("N4");
  });
  it("unknown type ids sort last without throwing", () => {
    const odd = mk("X1", "ZZZ", "Mystery", "active");
    expect(compareByType(odd, fleet[0]!)).toBeGreaterThan(0);
  });
  it("does not mutate input and groups labels", () => {
    const copy = [...fleet];
    sortFleet(fleet, "type", "asc");
    expect(fleet).toEqual(copy);
    expect(groupLabel(fleet[1]!, "type")).toBe("Boeing 737 NG");
    expect(groupLabel(fleet[1]!, "status")).toBe("Active");
    expect(groupLabel(fleet[1]!, "tail")).toBeNull();
  });
});
