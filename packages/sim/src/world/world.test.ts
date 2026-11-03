import { describe, expect, it } from "vitest";
import { aircraftTypes, airports, canFlyRoute } from "@arg/data";
import type { Airport } from "@arg/contracts";
import { applyCommand } from "../commands";
import { carriedShare } from "../route/rivalSizing";
import { simulateRouteWeek, ROUTE_CHOICE_PARAMS } from "../route/routeModel";
import { baseWeeklyDemand, hasSurfaceAlternative, marketOnDay, pairMarket, seasonality } from "../demand/market";
import { benchmarkFare } from "../demand/choice";
import { benchmarkFareFor } from "../demand/fares";
import { DEFAULT_METROS, catchmentOf } from "../demand/metros";
import { evaluateRoute } from "../finance/ledger";
import { baseJetAPriceUsdPerGallon, jetAPriceUsdPerGallon } from "../finance/fuel";
import { distanceKm } from "../geo";
import { drainEvents, runDays, stepDay } from "../index";
import { startingScenario } from "../scenario";
import { AIRPORTS, LAX, SFO, SAN, HNL } from "../testing/fixtures";
import { airportEpoch, airportOpen, dateToDay } from "./closures";
import { costFactors, fareLevel, surfaceAlternative } from "./regions";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const ap = (id: string) => A.get(id)!;
const y = (yr: number, frac: number) => Math.round((yr - 2015) * 365.25 + frac * 365);

describe("fuel: region-generic, CA/HI unchanged", () => {
  const d = y(2019, 0.4);
  it("CA, OR, WA and unknown places are the base series; HI adds 0.35 exactly", () => {
    const base = baseJetAPriceUsdPerGallon(d);
    for (const r of ["CA", "OR", "WA", "ZZ"]) expect(jetAPriceUsdPerGallon(d, r)).toBe(base);
    expect(jetAPriceUsdPerGallon(d, "HI")).toBeCloseTo(base + 0.35, 12);
    expect(jetAPriceUsdPerGallon(d, ap("LAX"))).toBe(base);
    expect(jetAPriceUsdPerGallon(d, ap("HNL"))).toBeCloseTo(base + 0.35, 12);
    expect(jetAPriceUsdPerGallon(d)).toBe(base);
  });
  it("Gulf Coast is cheaper than the West Coast; Europe differs by country; Alaska has a premium", () => {
    expect(jetAPriceUsdPerGallon(d, ap("IAH"))).toBeLessThan(jetAPriceUsdPerGallon(d, ap("LAX")));
    expect(jetAPriceUsdPerGallon(d, ap("JFK"))).toBeLessThan(jetAPriceUsdPerGallon(d, ap("LAX")));
    expect(jetAPriceUsdPerGallon(d, ap("ANC"))).toBeGreaterThan(jetAPriceUsdPerGallon(d, ap("LAX")));
    expect(jetAPriceUsdPerGallon(d, ap("OSL"))).toBeGreaterThan(jetAPriceUsdPerGallon(d, ap("FRA")));
    // The European carbon cost grows over the campaign.
    expect(jetAPriceUsdPerGallon(y(2025, 0.3), ap("FRA")) / baseJetAPriceUsdPerGallon(y(2025, 0.3))).toBeGreaterThan(jetAPriceUsdPerGallon(y(2015, 0.3), ap("FRA")) / baseJetAPriceUsdPerGallon(y(2015, 0.3)));
  });
});

describe("operating-cost multipliers", () => {
  it("US pairs keep factor 1; Europe pays more for airports and handling and less for crew", () => {
    expect(costFactors(ap("LAX"), ap("HNL"))).toEqual({ airport: 1, handling: 1, labour: 1 });
    const eu = costFactors(ap("FRA"), ap("CDG"));
    expect(eu.airport).toBeGreaterThan(1);
    expect(eu.handling).toBeGreaterThan(1);
    expect(eu.labour).toBeLessThan(1);
    expect(costFactors(ap("WAW"), ap("WAW")).labour).toBeLessThan(costFactors(ap("ZRH"), ap("ZRH")).labour);
  });
  it("the ledger charges them: the same sector costs more in airport fees and less in crew when flown in Europe", () => {
    const us = { ...ap("LAX") }, us2 = { ...ap("SFO") };
    const eu: Airport = { ...us, id: "XA1", country: "FR", region: "FR", landmass: "EU-MAINLAND" };
    const eu2: Airport = { ...us2, id: "XA2", country: "FR", region: "FR", landmass: "EU-MAINLAND" };
    const cab = [{ cls: "Y" as const, seats: 180, fare: 100 }];
    const line = (r: ReturnType<typeof evaluateRoute>, k: string) => r.lines.find((l) => l.key === k)!.weekly;
    const rUs = evaluateRoute({ origin: us, destination: us2, aircraft: T.get("A320")!, day: 100, weeklyFrequency: 14, cabins: cab, weeklyPassengers: 2000 });
    const rEu = evaluateRoute({ origin: eu, destination: eu2, aircraft: T.get("A320")!, day: 100, weeklyFrequency: 14, cabins: cab, weeklyPassengers: 2000 });
    expect(line(rEu, "airport")).toBeGreaterThan(line(rUs, "airport") * 1.1);
    expect(line(rEu, "handling")).toBeGreaterThan(line(rUs, "handling") * 1.05);
    expect(line(rEu, "crew")).toBeLessThan(line(rUs, "crew"));
  });
});

describe("surface alternatives", () => {
  it("land pairs by landmass; Alaska is roadless; water crossings have none", () => {
    expect(hasSurfaceAlternative(ap("LAX"), ap("SFO"))).toBe(true);
    expect(hasSurfaceAlternative(ap("JFK"), ap("ORD"))).toBe(true);
    expect(hasSurfaceAlternative(ap("ANC"), ap("FAI"))).toBe(false);
    expect(hasSurfaceAlternative(ap("ANC"), ap("JNU"))).toBe(false);
    expect(hasSurfaceAlternative(ap("SEA"), ap("ANC"))).toBe(false);
    expect(hasSurfaceAlternative(ap("HNL"), ap("OGG"))).toBe(false);
    expect(hasSurfaceAlternative(ap("JFK"), ap("LHR"))).toBe(false);
    expect(hasSurfaceAlternative(ap("MAD"), ap("BCN"))).toBe(true);
    expect(hasSurfaceAlternative(ap("BCN"), ap("PMI"))).toBe(false);
    expect(hasSurfaceAlternative(ap("LHR"), ap("CDG"))).toBe(true); // through the Channel Tunnel
    expect(hasSurfaceAlternative(ap("DUB"), ap("LHR"))).toBe(false);
  });
  it("high-speed rail corridors: Europe, the Channel, the US Northeast Corridor", () => {
    expect(surfaceAlternative(ap("CDG"), ap("LYS")).rail).toBe(1);
    expect(surfaceAlternative(ap("LHR"), ap("CDG")).rail).toBe(1);
    expect(surfaceAlternative(ap("LHR"), ap("AMS")).rail).toBe(0);
    expect(surfaceAlternative(ap("JFK"), ap("BOS")).rail).toBeGreaterThan(0);
    expect(surfaceAlternative(ap("LAX"), ap("SFO")).rail).toBe(0);
    expect(surfaceAlternative(ap("MAD"), ap("BCN")).groundKm).toBeGreaterThan(surfaceAlternative(ap("LAX"), ap("SFO")).groundKm);
  });
  it("short European hops lose far more of the market to the ground than the same hop in the US, long ones do not", () => {
    const geo = (id: string, o: Airport, lat: number, lon: number): Airport => ({ ...o, id, lat, lon });
    const mk = (eu: boolean, km: number): [Airport, Airport] => {
      const base = { ...ap("ATL"), metroPopulation: 3_000_000, gdpPerCapita: 50_000, tourismIndex: 0.3 };
      const a = geo(eu ? "EA" : "UA", eu ? { ...base, country: "FR", region: "FR", landmass: "EU-MAINLAND" } : base, 45, 2);
      const b = geo(eu ? "EB" : "UB", eu ? { ...base, country: "FR", region: "FR", landmass: "EU-MAINLAND" } : base, 45 + km / 111.2, 2);
      return [a, b];
    };
    const share = (eu: boolean, km: number) => {
      const [a, b] = mk(eu, km);
      const dist = distanceKm(a, b);
      const m = marketOnDay(a, b, 100);
      return carriedShare(a, b, dist, m.bySegment, benchmarkFareFor(a, b, dist), ROUTE_CHOICE_PARAMS);
    };
    // 450 km: rail takes a big bite in Europe.
    expect(share(true, 450)).toBeLessThan(share(false, 450) * 0.75);
    // 1,500 km: no real difference.
    expect(share(true, 1500)).toBeGreaterThan(share(false, 1500) * 0.95);
    // Gravity damping (same populations and income): the European ground distance is longer.
    const [ea, eb] = mk(true, 250), [ua, ub] = mk(false, 250);
    const euIncome = (50_000 / 40_000) ** 1.28, usIncome = (50_000 / 75_000) ** 1.28;
    expect(baseWeeklyDemand(ea, eb) / euIncome).toBeLessThan(baseWeeklyDemand(ua, ub) / usIncome);
  });
});

describe("fare level", () => {
  it("is 1 in the US, below 1 inside Europe, in between across the Atlantic", () => {
    expect(fareLevel(ap("LAX"), ap("SFO"))).toBe(1);
    expect(benchmarkFareFor(ap("LAX"), ap("SFO"))).toBe(benchmarkFare(distanceKm(ap("LAX"), ap("SFO"))));
    const eu = fareLevel(ap("FRA"), ap("MAD")), atl = fareLevel(ap("JFK"), ap("LHR"));
    expect(eu).toBeLessThan(1);
    expect(eu).toBeGreaterThan(0.6);
    expect(atl).toBeGreaterThan(eu * 0.9);
    expect(atl).toBeLessThanOrEqual(1);
    expect(fareLevel(ap("OSL"), ap("ARN"))).toBeGreaterThan(fareLevel(ap("WAW"), ap("BUD")));
  });
});

describe("seasonality: new regions", () => {
  const jan = 15, jul = 196, feb = 45, aug = 227;
  it("Mediterranean sun peaks in summer, Alpine ski in winter, Florida in late winter, Alaska in July", () => {
    const sun = (d: number) => seasonality(d, "leisure", ap("LGW"), ap("HER"));
    expect(sun(jul)).toBeGreaterThan(sun(jan) * 2);
    const ski = (d: number) => seasonality(d, "leisure", ap("LGW"), ap("INN"));
    expect(ski(jan)).toBeGreaterThan(ski(jul) * 1.5);
    const fl = (d: number) => seasonality(d, "leisure", ap("JFK"), ap("RSW"));
    expect(fl(feb)).toBeGreaterThan(fl(aug) * 1.4);
    const ak = (d: number) => seasonality(d, "leisure", ap("SEA"), ap("JNU"));
    expect(ak(jul)).toBeGreaterThan(ak(jan) * 2.5);
  });
  it("European business dips harder in August than US business", () => {
    const eu = seasonality(aug, "business", ap("FRA"), ap("CDG")) / seasonality(feb, "business", ap("FRA"), ap("CDG"));
    const us = seasonality(aug, "business", ap("JFK"), ap("ORD")) / seasonality(feb, "business", ap("JFK"), ap("ORD"));
    expect(eu).toBeLessThan(us - 0.1);
  });
  it("California and Hawaii pairs keep their original curves", () => {
    const m = (d: number) => seasonality(d, "leisure", LAX, HNL);
    expect(m(jul)).toBeGreaterThan(m(y(2015, 0.7)) * 1.2);
    // PSP, SAN etc. are untagged: the mainland-leisure/hawaii mix by tourism, identical to the fixtures' version of the airport.
    expect(seasonality(feb, "leisure", ap("LAX"), ap("PSP"))).toBeCloseTo(seasonality(feb, "leisure", LAX, { ...ap("PSP") }), 12);
  });
});

const closeTxlDay = dateToDay("2020-11-09");
describe("demand: metros from the data package, caching", () => {
  it("LA, SF and Seattle are the original calibration; the rest of the world has metros too", () => {
    const by = new Map(DEFAULT_METROS.map((m) => [m.id, m]));
    expect(by.get("LA")).toEqual({ id: "LA", anchors: ["LAX", "ONT"], population: 17_750_000, shares: { LAX: 0.78, SNA: 0.1, ONT: 0.044, BUR: 0.042, LGB: 0.034 } });
    expect(by.get("SF")).toEqual({ id: "SF", anchors: ["SFO", "SJC"], population: 6_630_000, shares: { SFO: 0.7, OAK: 0.16, SJC: 0.14 } });
    expect(by.get("SEA")).toEqual({ id: "SEA", anchors: ["SEA"], population: 3_733_000, shares: { SEA: 0.88, PAE: 0.08, BFI: 0.04 } });
    expect(by.get("NYC")!.population).toBe(20_200_000);
    expect(by.get("LON")!.shares["LHR"]).toBeGreaterThan(0.4);
    for (const m of DEFAULT_METROS) expect(Object.values(m.shares).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(DEFAULT_METROS.length).toBeGreaterThan(20);
  });
  it("LA/SF/SEA pair volumes are unchanged by the data metros (fixtures vs data airports agree where the inputs agree)", () => {
    const f = baseWeeklyDemand(LAX, SFO), g = baseWeeklyDemand({ ...LAX }, { ...SFO });
    expect(f).toBe(g);
    expect(baseWeeklyDemand(SAN, HNL)).toBeGreaterThan(0);
  });
  it("is cached per pair: a million lookups are cheap, and values do not drift", () => {
    const a = ap("JFK"), b = ap("LAX");
    const first = baseWeeklyDemand(a, b);
    const t0 = performance.now();
    let s = 0;
    for (let i = 0; i < 1_000_000; i++) s += baseWeeklyDemand(a, b);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(s / 1_000_000).toBeCloseTo(first, 4);
    expect(pairMarket(a, b).baseWeekly).toBe(first);
  });
  it("a closed airport's metro share moves to its sibling", () => {
    // Schoenefeld closed on 26 Oct 2020, Tegel on 9 Nov: in between Tegel is Berlin's only airport.
    const before = catchmentOf("TXL", 4_500_000, DEFAULT_METROS, 800, undefined, dateToDay("2020-10-01")).share;
    const between = dateToDay("2020-11-01");
    expect(catchmentOf("SXF", 4_500_000, DEFAULT_METROS, 800, undefined, between).share).toBe(0);
    expect(catchmentOf("TXL", 4_500_000, DEFAULT_METROS, 800, undefined, between).share).toBe(1);
    expect(before).toBeLessThan(1);
    expect(catchmentOf("TXL", 4_500_000, DEFAULT_METROS, 800, undefined, closeTxlDay).share).toBe(0);
  });
});

describe("transatlantic: B787-9", () => {
  it("can fly JFK-LHR, BOS-DUB, ORD-FRA; a 737-800 cannot; the ledger agrees", () => {
    const t = T.get("B787-9")!;
    for (const [o, d] of [["JFK", "LHR"], ["BOS", "DUB"], ["ORD", "FRA"], ["LAX", "LHR"], ["MIA", "MAD"]] as const) {
      expect(canFlyRoute(t, ap(o), ap(d)), `${o}-${d}`).toBe(true);
    }
    expect(canFlyRoute(T.get("B737-800")!, ap("JFK"), ap("LHR"))).toBe(false);
    const ev = evaluateRoute({
      origin: ap("JFK"), destination: ap("LHR"), aircraft: t, day: y(2018, 0.4), weeklyFrequency: 7,
      cabins: [{ cls: "J", seats: 30, fare: 2200 }, { cls: "Y", seats: 250, fare: 330 }], weeklyPassengers: 0,
    });
    expect(ev.feasible).toBe(true);
    const bad = evaluateRoute({ origin: ap("JFK"), destination: ap("LHR"), aircraft: T.get("B737-800")!, day: 100, weeklyFrequency: 7, cabins: [{ cls: "Y", seats: 180, fare: 300 }], weeklyPassengers: 0 });
    expect(bad.feasible).toBe(false);
  });
  it("a daily JFK-LHR 787-9 has a sensible load factor, yield and margin", () => {
    const sim = startingScenario(airports, aircraftTypes, 3);
    const day = y(2018, 0.4);
    const fare = Math.round(benchmarkFareFor(ap("JFK"), ap("LHR")));
    const route = { id: "t1", origin: "JFK", destination: "LHR", weeklyFrequency: 7, fares: { Y: fare, J: fare * 3 }, typeId: "B787-9" };
    const wk = simulateRouteWeek(route, new Map(sim.airports.map((a) => [a.id, a])), new Map(sim.aircraftTypes.map((t) => [t.id, t])), day, { rivalItineraries: undefined });
    expect(wk).not.toBeNull();
    const ev = wk!.evaluation;
    console.log(`TRANSATLANTIC JFK-LHR 787-9 7/wk fare ${fare}: LF ${ev.loadFactor.toFixed(2)} yield/pax ${(ev.revenue / ev.passengersPerWeek).toFixed(0)} margin ${ev.margin.toFixed(2)} aircraft ${ev.aircraftEquivalent.toFixed(1)} CASM-ish ${(ev.costs / ev.seatsPerWeek / ev.distanceKm * 100).toFixed(1)} c/seat-km`);
    expect(ev.feasible).toBe(true);
    expect(ev.loadFactor).toBeGreaterThan(0.6);
    expect(ev.loadFactor).toBeLessThanOrEqual(1);
    const rev = ev.revenue / ev.passengersPerWeek;
    expect(rev).toBeGreaterThan(250);
    expect(rev).toBeLessThan(1100);
    expect(ev.margin).toBeGreaterThan(-0.1);
    expect(ev.margin).toBeLessThan(0.4);
  });
  it("opening an unflyable overwater route is refused with a clear error", () => {
    const sim = startingScenario(airports, aircraftTypes, 3);
    const r = applyCommand(sim, { kind: "openRoute", route: { origin: "LAX", destination: "HNL", weeklyFrequency: 7, fares: { Y: 250 }, typeId: "CRJ700" } });
    expect(r.result.ok).toBe(false);
  });
});

describe("airport closures and openings", () => {
  const closeTxl = dateToDay("2020-11-09");
  it("table dates", () => {
    expect(dateToDay("2015-01-01")).toBe(0);
    expect(dateToDay("2016-01-01")).toBe(365);
    expect(dateToDay("2020-10-31") - dateToDay("2020-10-01")).toBe(30);
    expect(airportOpen("TXL", closeTxl - 1)).toBe(true);
    expect(airportOpen("TXL", closeTxl)).toBe(false);
    expect(airportOpen("SXF", dateToDay("2020-10-26"))).toBe(false);
    expect(airportOpen("RYG", dateToDay("2016-10-31"))).toBe(true);
    expect(airportOpen("RYG", dateToDay("2016-11-01"))).toBe(false);
    expect(airportOpen("DSA", dateToDay("2022-12-01"))).toBe(false);
    expect(airportOpen("LAX", 99999)).toBe(true);
    expect(airportOpen("BER", dateToDay("2020-10-30"))).toBe(false);
    expect(airportOpen("BER", dateToDay("2020-10-31"))).toBe(true);
    expect(airportEpoch(closeTxl)).toBeGreaterThan(airportEpoch(closeTxl - 400));
  });
  it("demand for a closed airport is zero and Berlin keeps flying through the sibling in between", () => {
    expect(marketOnDay(ap("TXL"), ap("LHR"), closeTxl - 1).weekly).toBeGreaterThan(0);
    expect(marketOnDay(ap("TXL"), ap("LHR"), closeTxl).weekly).toBe(0);
    expect(marketOnDay(ap("TXL"), ap("LHR"), dateToDay("2020-11-01")).weekly).toBeGreaterThan(marketOnDay(ap("TXL"), ap("LHR"), dateToDay("2020-09-30")).weekly);
    expect(marketOnDay(ap("SXF"), ap("LHR"), dateToDay("2020-11-01")).weekly).toBe(0);
  });
  it("a player route to a closed airport is cancelled on the closing day with a notice; opening one afterwards is refused", () => {
    let s = startingScenario(airports, aircraftTypes, 5);
    s = { ...s, rivals: null, world: { ...s.world, day: closeTxl - 3 } };
    const open = applyCommand(s, { kind: "openRoute", route: { origin: "LAX", destination: "TXL", weeklyFrequency: 3, fares: { Y: 500, J: 1800 }, typeId: "B777-200ER" } });
    expect(open.result.ok).toBe(true);
    s = drainEvents(open.state).state;
    expect(s.world.routes.some((r) => r.destination === "TXL")).toBe(true);
    s = runDays(s, 2);
    expect(s.world.routes.some((r) => r.destination === "TXL")).toBe(true);
    s = runDays(s, 2);
    expect(s.world.routes.some((r) => r.destination === "TXL")).toBe(false);
    expect(Object.keys(s.routeReports).every((id) => s.world.routes.some((r) => r.id === id))).toBe(true);
    const notes = drainEvents(s).events.filter((e) => e.kind === "notice" && /TXL/.test(e.text) && /cancelled/.test(e.text));
    expect(notes.length).toBe(1);
    const again = applyCommand(s, { kind: "openRoute", route: { origin: "LAX", destination: "TXL", weeklyFrequency: 3, fares: { Y: 500 }, typeId: "B777-200ER" } });
    expect(again.result).toMatchObject({ ok: false, error: "airport_closed" });
  });
  it("rivals stop flying a closed airport and move their base", () => {
    let s = startingScenario(airports, aircraftTypes, 6);
    s = { ...s, world: { ...s.world, day: closeTxl - 10 } };
    // Give a European legacy carrier a Berlin route and base, as if it had grown there.
    const rivals = structuredClone(s.rivals!);
    const air = rivals.airlines.find((a) => a.id === "rheinland-air")!;
    const src = air.routes.find((r) => r.origin === "FRA" && r.destination === "CDG") ?? air.routes[0]!;
    air.routes.push({ ...src, id: "rheinland-air:txl", origin: "FRA", destination: "TXL", enteredDay: s.world.day });
    air.bases.push("TXL");
    s = { ...s, rivals };
    s = runDays(s, 21);
    const after = s.rivals!.airlines.find((a) => a.id === "rheinland-air")!;
    expect(after.routes.some((r) => r.origin === "TXL" || r.destination === "TXL")).toBe(false);
    expect(after.bases.includes("TXL")).toBe(false);
    for (const a of s.rivals!.airlines) {
      for (const r of a.routes) expect([r.origin, r.destination].every((id) => airportOpen(id, s.world.day)), `${a.name} ${r.origin}-${r.destination}`).toBe(true);
    }
  });
});
void AIRPORTS; void SFO; void stepDay;
