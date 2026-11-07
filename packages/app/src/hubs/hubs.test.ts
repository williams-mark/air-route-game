import { describe, expect, it } from "vitest";
import type { HubCongestion, Terminal } from "@arg/contracts";
import { deltaText, hubCardIds, isEstimate, otherHubs, runwayShare, slotBar, terminalRows } from "./hubs";

const terms: Terminal[] = [
  { id: "T1", name: "Terminal 1", feeMultiplier: 1, premium: false, slotShare: 0.6, source: "estimate: rule S" },
  { id: "T2", name: "Terminal 2", feeMultiplier: 1.5, premium: true, slotShare: 0.4, source: "https://example.org/fees" },
];
const cong: HubCongestion = {
  airportId: "XXX", slotsPerWeekTotal: 1000, slotsUsedByPlayer: 100, slotsUsedByAll: 600, slotsAvailable: 400,
  terminals: [{ terminalId: "T1", slotsUsedByPlayer: 100, slotsCapacity: 600, weeklyFeeUsd: 10000 }, { terminalId: "T2", slotsUsedByPlayer: 0, slotsCapacity: 400, weeklyFeeUsd: 0 }],
};

describe("hubs helpers", () => {
  it("detects estimate sources", () => {
    expect(isEstimate("estimate: no published fees")).toBe(true);
    expect(isEstimate("  Estimate: x")).toBe(true);
    expect(isEstimate("https://lawa.org")).toBe(false);
  });
  it("splits the slot bar", () => {
    const b = slotBar(cong);
    expect(b.mine).toBeCloseTo(0.1);
    expect(b.others).toBeCloseTo(0.5);
    expect(b.free).toBeCloseTo(0.4);
    expect(b.over).toBe(false);
    expect(slotBar({ ...cong, slotsUsedByAll: 1200, slotsAvailable: 0 }).over).toBe(true);
    expect(slotBar({ slotsPerWeekTotal: 0, slotsUsedByPlayer: 0, slotsUsedByAll: 0, slotsAvailable: 0 }).free).toBe(1);
  });
  it("prices a move to another terminal", () => {
    const rows = terminalRows(terms, cong, "T1", 100);
    expect(rows[0]).toMatchObject({ yours: true, estimate: true, deltaUsd: 0, weeklyFeeUsd: 10000 });
    expect(rows[1]).toMatchObject({ yours: false, estimate: false, premium: true, feeIfMovedUsd: 15000, deltaUsd: 5000 });
  });
  it("handles an airport with one implicit terminal", () => {
    const only: Terminal = { id: "MAIN", name: "Main terminal", feeMultiplier: 1, premium: false, slotShare: 1, source: "implicit: airport has no terminal data" };
    const rows = terminalRows([only], { ...cong, terminals: [{ terminalId: "MAIN", slotsUsedByPlayer: 100, slotsCapacity: 1000, weeklyFeeUsd: 7000 }] }, "MAIN", 70);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ implicit: true, estimate: false, yours: true, weeklyFeeUsd: 7000 });
  });
  it("lists other hubs without the home hub", () => {
    expect(otherHubs(["DEN", "LAX", "SFO"], "LAX")).toEqual(["DEN", "SFO"]);
    expect(otherHubs(["LAX"], "LAX")).toEqual([]);
  });
  it("lists the home hub first on the cards, then the other hubs", () => {
    expect(hubCardIds(["SFO", "LAX", "DEN", "LAX"], "LAX")).toEqual(["LAX", "DEN", "SFO"]);
    expect(hubCardIds(["LAX"], "LAX")).toEqual(["LAX"]);
  });
  it("scales the runway bar and caps it", () => {
    expect(runwayShare(2250)).toBeCloseTo(0.5);
    expect(runwayShare(9000)).toBe(1);
    expect(runwayShare(-5)).toBe(0);
  });
  it("formats the weekly delta", () => {
    expect(deltaText(5000)).toBe("+$5,000 a week");
    expect(deltaText(-300.4)).toBe("−$300 a week");
    expect(deltaText(0.2)).toBe("no change in weekly fees");
  });
});
