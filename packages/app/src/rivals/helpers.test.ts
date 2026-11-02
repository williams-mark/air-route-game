import { describe, expect, it } from "vitest";
import { airports, aircraftTypes } from "@arg/data";
import { startingScenario, stepDay } from "@arg/sim";
import { buildRivalsView, competitionFor, fareBandText, fareVsBand, fleetBand, marketFor, marketsOf, scaleFares } from "./helpers";

describe("rival helpers", () => {
  it("bands fleet sizes", () => {
    expect([0, 3, 8, 20, 40, 90].map(fleetBand)).toEqual(["none", "1 to 5", "6 to 12", "13 to 25", "26 to 50", "50+"]);
  });
  it("compares fares to a band", () => {
    const b = { low: 100, high: 130 };
    expect([fareVsBand(90, b), fareVsBand(110, b), fareVsBand(140, b)]).toEqual(["below", "within", "above"]);
    expect(fareBandText(b)).toBe("$100 to $130");
  });
  it("scales fares", () => {
    expect(scaleFares({ Y: 100, J: 400 }, 0.9)).toEqual({ Y: 90, J: 360 });
    expect(scaleFares({ Y: 10 }, 0.5)).toEqual({ Y: 20 });
  });
  it("builds a fogged view from a real sim", () => {
    let s = startingScenario(airports, aircraftTypes, 2015);
    for (let i = 0; i < 30; i++) s = stepDay(s);
    const v = buildRivalsView(s);
    expect(v.list.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(v)).not.toMatch(/cash|profit/i);
    const first = v.markets[0]!;
    expect(marketFor(v, first.destination, first.origin)).toBe(first);
    expect(marketsOf(v, first.carriers[0]!.rivalId).length).toBeGreaterThan(0);
    const route = s.world.routes[0]!;
    const comp = competitionFor(v, route, 1000);
    if (comp) expect(comp.rivalSeatShare).toBeGreaterThan(0);
  });
});
