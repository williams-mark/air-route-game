import { describe, expect, it } from "vitest";
import type { FleetItem } from "../sim/bridge";
import { atHub, buildTypeRows, hubOptions, ownedOrOrderedTypeIds } from "./typeTable";

const mk = (tail: string, typeId: string, status: FleetItem["status"], hub?: string): FleetItem =>
  ({ id: tail, tail, typeId, typeName: typeId, status, ageYears: 2, seats: 150, routes: [], hub });
const fleet = [
  mk("N1", "B737-800", "active", "LAX"),
  mk("N2", "B737-800", "maintenance", "SFO"),
  mk("N3", "B737-800", "delivery", "LAX"),
  mk("N4", "A320", "stored", "LAX"),
  mk("N5", "A321", "delivery", "SFO"),
];
const hours = (typeId: string, hub: string) => (typeId === "B737-800" ? (hub === "all" ? { available: 300, used: 120, free: 180 } : { available: 150, used: 40, free: 110 }) : { available: 0, used: 0, free: 0 });

describe("type table rows", () => {
  it("counts in-service and on-order per type across all hubs", () => {
    const rows = buildTypeRows(fleet, "all", hours);
    const b = rows.find((r) => r.typeId === "B737-800")!;
    expect(b).toMatchObject({ inService: 2, onOrder: 1, availableHours: 300, usedHours: 120, freeHours: 180 });
    expect(rows.find((r) => r.typeId === "A320")).toMatchObject({ inService: 0, onOrder: 0 });
  });

  it("restricts counts and hours to one hub", () => {
    const rows = buildTypeRows(fleet, "LAX", hours);
    const b = rows.find((r) => r.typeId === "B737-800")!;
    expect(b).toMatchObject({ inService: 1, onOrder: 1, freeHours: 110 });
    expect(rows.find((r) => r.typeId === "A321")).toMatchObject({ inService: 0, onOrder: 0 });
  });

  it("keeps one row per type in first-appearance order", () => {
    expect(buildTypeRows(fleet, "all", hours).map((r) => r.typeId)).toEqual(["B737-800", "A320", "A321"]);
  });
});

describe("hub filter", () => {
  it("all matches every aircraft, a hub matches its own, aircraft without a hub use the home hub", () => {
    expect(atHub({ hub: "SFO" }, "all")).toBe(true);
    expect(atHub({ hub: "SFO" }, "LAX")).toBe(false);
    expect(atHub({}, "LAX", "LAX")).toBe(true);
  });

  it("lists the home hub first, then hubs in use", () => {
    expect(hubOptions(fleet, "LAX")).toEqual(["LAX", "SFO"]);
    expect(hubOptions([], undefined)).toEqual([]);
  });
});

describe("owned or ordered types for the route sandbox", () => {
  it("includes types in the fleet or on order, excludes types only stored", () => {
    const ids = ownedOrOrderedTypeIds(fleet);
    expect([...ids].sort()).toEqual(["A321", "B737-800"]);
  });
});
