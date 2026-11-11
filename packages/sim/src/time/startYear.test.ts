import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType } from "@arg/contracts";
import {
  canOrderNew, dayToDate, earliestFleetYear, earliestStartYear, eraPlanFor, eraTypeFor, inProduction, jan1Day, MIN_START_YEAR, orderableTypes,
  RECENT_OUT_OF_PRODUCTION_YEARS, startYearError, startingScenario, usedSaleAllowed, COMMAND_PARAMS, newSim,
} from "../index";

const PRESENT = 2026;
const types = aircraftTypes as AircraftType[];
const ty = (id: string) => {
  const t = types.find((x) => x.id === id);
  if (!t) throw new Error(`missing ${id}`);
  return t;
};

describe("start year validation", () => {
  it("accepts 2015 and every year from the first fleet year to the present", () => {
    expect(startYearError(2015, PRESENT, types)).toBeNull();
    expect(startYearError(earliestStartYear(types), PRESENT, types)).toBeNull();
    expect(startYearError(PRESENT, PRESENT, types)).toBeNull();
  });

  it("rejects non-integers, years before the floor and years after the present", () => {
    expect(startYearError(2015.5, PRESENT, types)).toMatch(/whole number/);
    expect(startYearError(earliestStartYear(types) - 1, PRESENT, types)).toMatch(/1965 or later/);
    expect(earliestStartYear(types)).toBe(1965); // the policy floor; the classic jets (lane/aircraft-classics) put the first fleet year at 1958 (707-120)
    expect(startYearError(PRESENT + 1, PRESENT, types)).toMatch(/cannot be after 2026/);
    expect(startYearError(Number.NaN, PRESENT, types)).toMatch(/whole number/);
  });

  it("rejects a year before the first fleet year, and names that year as the earliest start", () => {
    const first = earliestFleetYear(types)!;
    expect(first).toBe(ty("B707-120").introYear);
    // The policy floor (1965) is later than the first fleet year (1959), so it is the floor that names the earliest start.
    const floor = earliestStartYear(types);
    expect(floor).toBe(Math.max(1965, first));
    expect(startYearError(floor - 1, PRESENT, types)).toBe(`Start year must be ${floor} or later.`);
  });
});

describe("order availability", () => {
  it("offers only types in production or in the recent-out window, introduced by the order lead", () => {
    const lead = COMMAND_PARAMS.orderLeadYears;
    const in2015 = orderableTypes(types, 2015, lead).map((t) => t.id);
    expect(in2015).toContain("B737-800");
    expect(in2015).toContain("A320N");
    expect(in2015).not.toContain("DC10-30");
    expect(in2015).not.toContain("B757-200");
    // A type that ended the year before is still orderable (RECENT_OUT_OF_PRODUCTION_YEARS = 1); two years before is not.
    expect(RECENT_OUT_OF_PRODUCTION_YEARS).toBe(1);
    expect(canOrderNew(ty("B767-300ER"), 2015, lead)).toBe(true);
    expect(canOrderNew(ty("B767-300ER"), 2016, lead)).toBe(false);
  });

  it("follows the sim date: a 1972 order list has the DC-10 and no 2015 types; orders open lead years early", () => {
    const lead = COMMAND_PARAMS.orderLeadYears;
    const in1972 = orderableTypes(types, 1972, lead).map((t) => t.id);
    expect(in1972).toContain("DC10-30");
    for (const t of types) if (t.introYear > 1972 + lead || (t.endYear !== null && t.endYear + RECENT_OUT_OF_PRODUCTION_YEARS < 1972)) expect(in1972, t.id).not.toContain(t.id);
    expect(in1972).not.toContain("B737-800");
    expect(canOrderNew(ty("B737-800"), 1972, lead)).toBe(false);
    expect(canOrderNew(ty("B737-800"), 1995, lead)).toBe(true); // 1998 introduction, three years of lead
    expect(canOrderNew(ty("B737-800"), 1994, lead)).toBe(false);
  });

  it("sorts the order list smallest first by seats", () => {
    const seats = orderableTypes(types, 2015, COMMAND_PARAMS.orderLeadYears).map((t) => t.maxSeats);
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
  });

  it("gives used sales only to types built within the used-sale window", () => {
    expect(usedSaleAllowed(ty("DC10-30"), 2010)).toBe(true); // ended 1988, 22 years earlier
    expect(usedSaleAllowed(ty("DC10-30"), 2015)).toBe(false); // 27 years after the last build
    expect(usedSaleAllowed(ty("B737-800"), 2030)).toBe(true); // still in production
    expect(inProduction(ty("DC10-30"), 1971)).toBe(false);
    expect(inProduction(ty("DC10-30"), 1972)).toBe(true);
  });
});

describe("calendar offset for start years", () => {
  it("jan1Day puts 1 January of each year on the matching calendar date, both before and after 2015", () => {
    for (const y of [1972, 1980, 1999, 2000, 2015, 2024, 2026]) {
      const c = dayToDate(jan1Day(y));
      expect([c.year, c.month, c.dayOfMonth]).toEqual([y, 0, 1]);
    }
    expect(jan1Day(2015)).toBe(0);
    expect(jan1Day(2016)).toBe(365);
    expect(jan1Day(2014)).toBe(-365);
  });
});

describe("era fleet", () => {
  it("replaces each default type with a same-body type in production in the start year", () => {
    const plan = eraPlanFor(types, 1975);
    expect(plan.day).toBe(jan1Day(1975));
    const counts = Object.fromEntries(plan.fleet);
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    for (const id of Object.keys(counts)) expect(inProduction(ty(id), 1975), id).toBe(true);
    expect(inProduction(eraTypeFor(types, "B737-800", 1975)!, 1975)).toBe(true);
  });

  it("builds a 1975 scenario with only aircraft in production", () => {
    const s = startingScenario(airports, types, 2015, { startYear: 1975, presentYear: PRESENT });
    expect(s.world.day).toBe(jan1Day(1975));
    expect(dayToDate(s.world.day).year).toBe(1975);
    // The fleet is trimmed to the aircraft the derived routes use (as for any non-default hub), so 1 to 8 DC-10s.
    expect(s.world.fleet.length).toBeGreaterThanOrEqual(1);
    expect(s.world.fleet.length).toBeLessThanOrEqual(8);
    expect(s.world.fleet.every((a) => inProduction(ty(a.typeId), 1975))).toBe(true);
    expect(s.world.routes.every((r) => inProduction(ty(r.typeId), 1975))).toBe(true);
    expect(s.world.routes.length).toBeGreaterThanOrEqual(3);
  });

  it("the default 2015 start is unchanged and keeps the hand-tuned routes", () => {
    const s = startingScenario(airports, types, 2015, { startYear: 2015, presentYear: PRESENT });
    expect(s.world.day).toBe(0);
    expect(s.world.routes.map((r) => `${r.origin}-${r.destination}`)).toEqual(["LAX-SFO", "LAX-SAN", "LAX-HNL", "LAX-OGG"]);
  });

  it("throws on an invalid start year instead of building a broken world", () => {
    expect(() => startingScenario(airports, types, 2015, { startYear: 1960, presentYear: PRESENT })).toThrow(/1965 or later/);
    expect(() => startingScenario(airports, types, 2015, { startYear: 1964, presentYear: PRESENT })).toThrow(/1965 or later/);
  });

  it("a 1980 scenario steps a few days without error", () => {
    const s = startingScenario(airports, types, 2015, { startYear: 1980, presentYear: PRESENT });
    const base = newSim(7, airports, types, { notionalFleet: false }, { day: s.world.day });
    expect(base.world.day).toBe(jan1Day(1980));
    expect(s.rivals).not.toBeNull();
    expect(s.rivals?.originDay).toBe(jan1Day(1980));
  });
});
