import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { drainEvents, newSim, runDays, startingScenario, STARTING_CASH_USD } from "./index";

describe("startingScenario", () => {
  const s = startingScenario(airports, aircraftTypes);

  it("is Skybridge Pacific at LAX in January 2015 with USD 150M", () => {
    expect(s.airlineName).toBe("Skybridge Pacific");
    expect(s.baseAirport).toBe("LAX");
    expect(s.world.day).toBe(0);
    expect(s.world.cash).toBe(STARTING_CASH_USD);
    expect(STARTING_CASH_USD).toBe(150_000_000);
  });

  it("has the specified fleet and routes", () => {
    const count = (id: string) => s.world.fleet.filter((a) => a.typeId === id).length;
    expect([count("B737-800"), count("A320"), count("B757-200"), count("B767-300ER"), count("B777-200ER")]).toEqual([3, 1, 2, 0, 2]);
    expect(s.world.fleet).toHaveLength(8);
    expect(s.world.fleet.every((a) => a.status === "active")).toBe(true);
    expect(new Set(s.world.fleet.map((a) => a.tailNumber)).size).toBe(8);
    expect(s.world.routes.map((r) => `${r.origin}-${r.destination}`)).toEqual(["LAX-SFO", "LAX-SAN", "LAX-HNL", "LAX-OGG"]);
  });

  it("flies every starting route fully scheduled, with no notional fleet, and earns money in a year", () => {
    let st = runDays(s, 7);
    for (const r of Object.values(st.routeReports)) {
      expect(r.evaluation.feasible).toBe(true);
      expect(r.notionalFleet).toBe(false);
      expect(r.scheduling!.underSupplied).toBe(0);
      expect(r.scheduling!.aircraftIds.length).toBeGreaterThan(0);
    }
    st = runDays(st, 358);
    expect(st.world.cash).toBeGreaterThan(STARTING_CASH_USD);
    // checks happened and the schedule recovered from them
    const { events } = drainEvents(st);
    expect(events.some((e) => e.kind === "notice" && e.text.includes("check"))).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const a = JSON.stringify(runDays(startingScenario(airports, aircraftTypes, 5), 40));
    const b = JSON.stringify(runDays(startingScenario(airports, aircraftTypes, 5), 40));
    expect(a).toBe(b);
    expect(a).not.toBe(JSON.stringify(runDays(startingScenario(airports, aircraftTypes, 6), 40)));
  });

  it("newSim accepts a starting fleet and cash", () => {
    const base = newSim(1, airports, aircraftTypes, {}, { cash: 5e6, fleet: s.world.fleet.slice(0, 2) });
    expect(base.world.cash).toBe(5e6);
    expect(base.world.fleet).toHaveLength(2);
    expect(Object.keys(base.fleetMeta)).toHaveLength(2);
  });
});
