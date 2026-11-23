import { describe, expect, it } from "vitest";
import { airports, aircraftTypes } from "@arg/data";
import { distanceKm, startingScenario, stepDay, type RivalAirline } from "@arg/sim";
import { airportPresence, buildRivalsView, competitionFor, newsAt, routeCompetitors, fareBandText, fareVsBand, fleetBand, marketFor, marketsOf, scaleFares } from "./helpers";

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

describe("rivals screen helpers (world field)", () => {
  let s = startingScenario(airports, aircraftTypes, 2015, { rivalField: "world" });
  for (let i = 0; i < 120; i++) s = stepDay(s);
  const v = buildRivalsView(s);

  it("lists outstations and aircraft on order, still with no finances", () => {
    expect(v.list).toHaveLength(s.rivals!.airlines.length);
    for (const r of v.list) { expect(Array.isArray(r.outstations)).toBe(true); expect(r.onOrder).toBeGreaterThanOrEqual(0); }
    expect(v.list.some((r) => r.onOrder > 0)).toBe(true);
    expect(JSON.stringify(v.list)).not.toMatch(/cash|profit/i);
  });

  it("shows each airline's role at an airport and where it flies from there", () => {
    const air = v.list.find((r) => r.status === "active" && r.routeCount > 0)!;
    const here = airportPresence(v, air.hub);
    const me = here.find((h) => h.rival.id === air.id)!;
    expect(me.role).toBe("hub");
    expect(me.destinations.length).toBeGreaterThan(0);
    expect(me.departures).toBe(me.destinations.reduce((t, d) => t + d.carrier.weeklyFrequency, 0));
    expect(here[0]!.role).toBe("hub"); // hubs listed first
    for (const h of here) if (h.role === "flies") expect(h.rival.hub).not.toBe(air.hub);
  });

  it("finds one-stop competitors through a rival's own base", () => {
    // A rival with two routes from its hub whose far ends make a sensible one-stop (no doubling back).
    const A = new Map(airports.map((a) => [a.id, a]));
    let found: { air: RivalAirline; hub: string; far: string[] } | null = null;
    for (const air of s.rivals!.airlines) {
      if (air.status !== "active" || found) continue;
      const hub = air.bases[0]!;
      const ends = air.routes.filter((r) => r.origin === hub || r.destination === hub).map((r) => (r.origin === hub ? r.destination : r.origin));
      for (let i = 0; i < ends.length && !found; i++) for (let j = i + 1; j < ends.length && !found; j++) {
        const x = A.get(ends[i]!)!, y = A.get(ends[j]!)!, h = A.get(hub)!;
        if (distanceKm(x, h) + distanceKm(h, y) <= 2 * distanceKm(x, y)) found = { air, hub, far: [ends[i]!, ends[j]!] };
      }
    }
    const { air, hub, far } = found!;
    const c = routeCompetitors(v, far[0]!, far[1]!);
    expect(c.oneStop.some((x) => x.rivalId === air.id && x.via === hub)).toBe(true);
    expect(routeCompetitors(v, hub, far[0]!).nonstop.some((x) => x.rivalId === air.id)).toBe(true);
  });

  it("recent moves at an airport include its airlines' orders, newest first", () => {
    const withOrder = v.news.find((n) => n.kind === "order");
    if (!withOrder) return;
    const hub = v.list.find((r) => r.id === withOrder.rivalId)!.hub;
    const items = newsAt(v, new Set([hub]), new Set([withOrder.rivalId]), 50);
    expect(items.some((n) => n.kind === "order" && n.rivalId === withOrder.rivalId)).toBe(true);
    for (let i = 1; i < items.length; i++) expect(items[i - 1]!.day).toBeGreaterThanOrEqual(items[i]!.day);
  });
}, 300_000);
