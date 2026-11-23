import { afterEach, describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "@arg/sim";
import { isWorldField, liveCompetitors, projectRoute, setLiveRivalsSource } from "./helpers";

describe("standalone projections in the world field", () => {
  afterEach(() => setLiveRivalsSource(() => null));

  it("use the running game's airlines, not the classic stand-in rival", () => {
    const sim = startingScenario(airports, aircraftTypes, 2015, { rivalField: "world" });
    setLiveRivalsSource(() => sim.rivals);
    expect(isWorldField()).toBe(true);
    // Some pair touching a rival base has real competitors; every pair gets an array (possibly empty), never the stand-in.
    const pairs = sim.rivals!.airlines.flatMap((r) => r.routes.map((rt) => [rt.origin, rt.destination] as const));
    const [o, d] = pairs[0]!;
    const comp = liveCompetitors(o, d);
    expect(Array.isArray(comp)).toBe(true);
    expect(comp!.length).toBeGreaterThan(0);
    expect(liveCompetitors("LAX", "SLC")).toBeDefined();
  });

  it("an uncontested pair projects a full market share; with no game the stand-in still applies", () => {
    const sim = startingScenario(airports, aircraftTypes, 2015, { rivalField: "world" });
    const route = { id: "p", origin: "LAX", destination: "SLC", weeklyFrequency: 7, fares: { Y: 150 }, typeId: sim.world.fleet[0]!.typeId };
    const withStandIn = projectRoute(route, sim.world.day)?.evaluation;
    setLiveRivalsSource(() => sim.rivals);
    const comp = liveCompetitors("LAX", "SLC") ?? [];
    const live = projectRoute(route, sim.world.day)?.evaluation;
    expect(withStandIn).toBeTruthy();
    expect(live).toBeTruthy();
    if (comp.length === 0) expect(live!.revenue).toBeGreaterThan(withStandIn!.revenue);
  });
});
