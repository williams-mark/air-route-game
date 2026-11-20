import { describe, expect, it } from "vitest";
import { byName, categoryCounts, inCategory, seatSplit } from "./categories";
import { buildTypeRows } from "./typeTable";

describe("fleet categories helpers", () => {
  it("seat split is F/J/W/Y", () => {
    expect(seatSplit({ sections: [{ cls: "J", rows: 3, seatsAcross: 4, pitchIn: 38 }, { cls: "Y", rows: 25, seatsAcross: 6, pitchIn: 30 }] })).toBe("0/12/0/150");
    expect(seatSplit(undefined)).toBe("–");
  });
  it("category filter: all, none, one category", () => {
    const cats = new Map([["a1", "cat-1"]]);
    expect(inCategory("a1", "all", cats)).toBe(true);
    expect(inCategory("a1", "cat-1", cats)).toBe(true);
    expect(inCategory("a2", "none", cats)).toBe(true);
    expect(inCategory("a1", "none", cats)).toBe(false);
  });
  it("type rows and names sort A-Z with numbers in natural order", () => {
    expect(["A321ceo", "A320neo", "B737-800", "A320ceo", "A220-100"].sort(byName)).toEqual(["A220-100", "A320ceo", "A320neo", "A321ceo", "B737-800"]);
    const item = (id: string, typeId: string, typeName: string) => ({ id, typeId, typeName, status: "active" }) as never;
    const rows = buildTypeRows([item("1", "A320", "A320ceo"), item("2", "B738", "B737-800"), item("3", "A320N", "A320neo")], "all", () => ({ available: 0, used: 0, free: 0 }));
    expect(rows.map((r) => r.typeName)).toEqual(["A320ceo", "A320neo", "B737-800"]);
  });
  it("aircraft per category follow the hub filter (no hub set = home hub)", () => {
    const fleet = [{ id: "a", hub: "IAH" }, { id: "b", hub: "IAH" }, { id: "c", hub: "DEN" }, { id: "d" }, { id: "e", hub: "IAH" }];
    const cats = new Map([["a", "nb"], ["b", "nb"], ["c", "nb"], ["d", "nb"], ["e", "wb"]]);
    expect([...categoryCounts(fleet, cats, "all", "ORD")]).toEqual([["nb", 4], ["wb", 1]]);
    expect([...categoryCounts(fleet, cats, "IAH", "ORD")]).toEqual([["nb", 2], ["wb", 1]]);
    expect([...categoryCounts(fleet, cats, "ORD", "ORD")]).toEqual([["nb", 1]]);
  });
});
