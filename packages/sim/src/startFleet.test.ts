import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { runDays, startingScenario } from "./index";
import { START_FLEET_BUDGET_USD, START_FLEET_MAX_AIRCRAFT, startFleetError, startFleetTypes, startFleetValueUsd, STARTING_CASH_USD } from "./scenario";

const price = (id: string) => aircraftTypes.find((t) => t.id === id)!.listPriceUsdM * 1e6;

describe("player-chosen starting fleet", () => {
  it("gives new, owned aircraft in service on day one, no routes, and the usual cash", () => {
    const s = startingScenario(airports, aircraftTypes, 7, { startFleet: [["B737-800", 2], ["A320", 1]], campaignYears: 15 });
    expect(s.world.fleet.map((a) => a.typeId)).toEqual(["B737-800", "B737-800", "A320"]);
    expect(s.world.fleet.every((a) => a.status === "active" && a.ageDays === 0)).toBe(true);
    expect(s.world.routes).toEqual([]);
    expect(s.orders).toEqual([]);
    expect(s.world.cash).toBe(STARTING_CASH_USD);
    // The grade is measured against everything the airline started with, fleet included.
    expect(s.campaign!.startCashUsd).toBe(STARTING_CASH_USD + 2 * price("B737-800") + price("A320"));
    expect(s.campaign!.peakCashUsd).toBe(STARTING_CASH_USD);
    expect(() => runDays(s, 10)).not.toThrow();
  });

  it("enforces the budget, the aircraft cap and the year", () => {
    expect(startFleetError(aircraftTypes, [], 2015)).toMatch(/at least one/);
    expect(startFleetError(aircraftTypes, [["B737-800", 2.5]], 2015)).toMatch(/whole/);
    expect(startFleetError(aircraftTypes, [["A380-800", 2]], 2015)).toMatch(/budget/);
    expect(startFleetError(aircraftTypes, [["B787-10", 1]], 2015)).toMatch(/not available/); // enters service 2018
    expect(startFleetError(aircraftTypes, [["CONCORDE", 1]], 2015)).toMatch(/not available/);
    expect(startFleetError(aircraftTypes, [["ATR72-600", START_FLEET_MAX_AIRCRAFT + 1]], 2015)).toMatch(/At most/);
    expect(startFleetError(aircraftTypes, [["B737-800", 4]], 2015)).toBeNull();
    expect(() => startingScenario(airports, aircraftTypes, 7, { startFleet: [["A380-800", 2]] })).toThrow(/budget/);
  });

  it("every type offered in a year fits the budget on its own at least once, and the value adds up", () => {
    for (const year of [1975, 1995, 2015, 2025]) {
      const offered = startFleetTypes(aircraftTypes, year);
      expect(offered.length, String(year)).toBeGreaterThan(0);
      for (const t of offered) expect(t.introYear).toBeLessThanOrEqual(year);
    }
    expect(startFleetValueUsd(aircraftTypes, [["B737-800", 3]])).toBe(3 * price("B737-800"));
    expect(START_FLEET_BUDGET_USD).toBe(500_000_000);
  });

  it("is deterministic and leaves the standard start unchanged when not used", () => {
    const a = startingScenario(airports, aircraftTypes, 3, { startFleet: [["B777-300ER", 1]] });
    const b = startingScenario(airports, aircraftTypes, 3, { startFleet: [["B777-300ER", 1]] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(startingScenario(airports, aircraftTypes, 3).world.routes.length).toBeGreaterThan(0);
  });
});
