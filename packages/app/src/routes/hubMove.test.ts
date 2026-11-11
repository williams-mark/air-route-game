import { describe, expect, it } from "vitest";
import type { FleetItem } from "../sim/bridge";
import { hubCallout, moveCandidates } from "./hubMove";

const mk = (tail: string, typeId: string, status: FleetItem["status"], hub: string, routes: string[] = []): FleetItem =>
  ({ id: tail, tail, typeId, typeName: typeId, status, ageYears: 3, seats: 150, routes, hub });
const cap = (t: string) => (t === "A321" ? 100 : 80);

describe("moveCandidates", () => {
  const fleet = [
    mk("N1", "B738", "active", "LAX"),
    mk("N2", "A321", "active", "LAX"),
    mk("N3", "B738", "active", "LAX", ["LAX–SFO"]),
    mk("N4", "B738", "maintenance", "LAX"),
    mk("N5", "B738", "delivery", "LAX"),
    mk("N6", "B738", "active", "ATL"),
  ];
  const rows = moveCandidates(fleet, "ATL", cap, "A321");
  it("leaves out aircraft already at the target", () => expect(rows.map((r) => r.tail)).not.toContain("N6"));
  it("marks idle active aircraft eligible with their free hours", () => {
    expect(rows.find((r) => r.tail === "N1")).toMatchObject({ eligible: true, freeHours: 80 });
    expect(rows.find((r) => r.tail === "N2")).toMatchObject({ eligible: true, freeHours: 100 });
  });
  it("refuses aircraft on routes and says to remove them first", () => {
    const r = rows.find((x) => x.tail === "N3")!;
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/remove it from its routes first/);
    expect(r.freeHours).toBe(0);
  });
  it("refuses hangar and on-order aircraft", () => {
    expect(rows.find((r) => r.tail === "N4")).toMatchObject({ eligible: false });
    expect(rows.find((r) => r.tail === "N5")!.reason).toMatch(/On order/);
  });
  it("orders eligible first and the preferred type first", () => {
    expect(rows.map((r) => r.tail)).toEqual(["N2", "N1", "N3", "N4", "N5"]);
  });
});

describe("hubCallout", () => {
  const base = { originOwned: true, typeId: "B738", available: 0, needed: 20, free: 0 };
  it("offers unlock when the origin is not a hub", () => expect(hubCallout({ ...base, originOwned: false })).toEqual({ kind: "unlock" }));
  it("says none based when the type has no hours at the hub", () => expect(hubCallout(base)).toEqual({ kind: "none_based", typeId: "B738" }));
  it("says short with the gap when hours are too few", () => expect(hubCallout({ ...base, available: 100, free: 15 })).toEqual({ kind: "short", typeId: "B738", shortBy: 5 }));
  it("is quiet when the draft fits or no type is picked", () => {
    expect(hubCallout({ ...base, available: 100, free: 50 })).toEqual({ kind: "none" });
    expect(hubCallout({ ...base, typeId: "" })).toEqual({ kind: "none" });
  });
});

describe("moveCandidates fit", () => {
  const fleet = [
    mk("S1", "B738", "active", "LAX"),
    mk("S2", "A321", "active", "LAX"),
    mk("S3", "E175", "active", "LAX"),
    mk("S4", "B738", "active", "SFO"),
  ];
  const canServe = (t: string) => t !== "E175";
  const rows = moveCandidates(fleet, "ATL", cap, "B738", canServe);
  it("puts aircraft that can fly the pair first, the drafted type first within them", () => {
    expect(rows.filter((r) => r.eligible).map((r) => r.tail)).toEqual(["S1", "S4", "S2"]);
  });
  it("says why a type that cannot fly the pair is unavailable, and keeps it out of the eligible group", () => {
    const r = rows.find((x) => x.tail === "S3")!;
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/range or runway/);
  });
});

