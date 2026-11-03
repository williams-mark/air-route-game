import { describe, expect, it } from "vitest";
import type { Airport } from "@arg/contracts";
import { airports } from "@arg/data";
import { airportFacets, fold, searchAirports } from "./airportSearch";
import { continentOf, placeLabel, regionName } from "./geoNames";

const ap = (id: string, city: string, name: string, region: string, country: string, slots = 20): Airport =>
  ({ id, city, name, region, country, landmass: "X", lat: 0, lon: 0, runwayM: 3000, metroPopulation: slots * 1000, gdpPerCapita: 1, tourismIndex: 0, slotsPerHour: slots });
const list = [
  ap("LHR", "London", "Heathrow", "GB", "GB", 90), ap("LGW", "London", "Gatwick", "GB", "GB", 50), ap("ZRH", "Zürich", "Zurich", "CH", "CH", 60),
  ap("LAX", "Los Angeles", "Los Angeles Intl", "CA", "US", 100), ap("SFO", "San Francisco", "San Francisco Intl", "CA", "US", 60),
  ap("LAS", "Las Vegas", "Harry Reid Intl", "NV", "US", 70), ap("BER", "Berlin", "Brandenburg", "DE", "DE", 60), ap("FRA", "Frankfurt", "Frankfurt Main", "DE", "DE", 90),
  ap("XXX", "Nowhere", "Mystery Field", "QQ", "QQ", 5),
];

describe("searchAirports", () => {
  it("ranks exact IATA, then code prefix, then city prefix, then substring", () => {
    expect(searchAirports("lax", list)[0]!.id).toBe("LAX");
    expect(searchAirports("la", list).map((a) => a.id).slice(0, 2)).toEqual(["LAX", "LAS"]);
  });
  it("matches city, name, state and country names without accents", () => {
    expect(searchAirports("zurich", list)[0]!.id).toBe("ZRH");
    expect(searchAirports("heath", list)[0]!.id).toBe("LHR");
    expect(searchAirports("california", list).map((a) => a.id).sort()).toEqual(["LAX", "SFO"]);
    expect(searchAirports("germany", list).map((a) => a.id)).toEqual(["FRA", "BER"]);
    expect(searchAirports("london gat", list).map((a) => a.id)).toEqual(["LGW"]);
  });
  it("empty query lists the biggest first; exclude and limit apply", () => {
    expect(searchAirports("", list, { limit: 2 }).map((a) => a.id)).toEqual(["LAX", "FRA"]);
    expect(searchAirports("lax", list, { exclude: ["LAX"] }).some((a) => a.id === "LAX")).toBe(false);
    expect(searchAirports("zzzz", list)).toEqual([]);
  });
  it("filters by continent, country and state", () => {
    expect(searchAirports("", list, { filter: { continent: "Europe" } }).every((a) => continentOf(a.country) === "Europe")).toBe(true);
    expect(searchAirports("", list, { filter: { country: "DE" } }).map((a) => a.id)).toEqual(["FRA", "BER"]);
    expect(searchAirports("", list, { filter: { country: "US", state: "NV" } }).map((a) => a.id)).toEqual(["LAS"]);
  });
  it("copes with unknown region codes", () => {
    expect(regionName(list[8]!)).toBe("QQ");
    expect(placeLabel(list[8]!)).toBe("Mystery Field, QQ");
    expect(searchAirports("qq", list)[0]!.id).toBe("XXX");
  });
  it("works on the real data", () => {
    expect(searchAirports("honolulu", airports)[0]!.id).toBe("HNL");
    expect(searchAirports("hawaii", airports).length).toBeGreaterThan(2);
  });
  it("is fast on 700 airports", () => {
    const big = Array.from({ length: 700 }, (_, i) => ap(`A${i}`, `City ${i}`, `Field ${i}`, "TX", "US", i % 90));
    const t = performance.now();
    for (let i = 0; i < 20; i++) searchAirports("cit", big);
    expect(performance.now() - t).toBeLessThan(400);
  });
});

describe("airportFacets", () => {
  it("counts continents, countries and states and narrows with the filter", () => {
    const f = airportFacets(list);
    expect(f.continents.map((c) => c.key).sort()).toEqual(["Europe", "North America", "Other"]);
    expect(f.states.map((s) => s.key).sort()).toEqual(["CA", "NV"]);
    expect(airportFacets(list, { continent: "Europe" }).countries.map((c) => c.key)).not.toContain("US");
    expect(airportFacets(list, { country: "DE" }).states).toEqual([]);
  });
  it("fold strips accents", () => { expect(fold("Zürich Ångström")).toBe("zurich angstrom"); });
});
