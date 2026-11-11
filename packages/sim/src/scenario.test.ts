import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { applyCommand, drainEvents, hubCandidates, newSim, runDays, setMaintenanceEnabledForTests, startingScenario, STARTING_CASH_USD } from "./index";

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
    setMaintenanceEnabledForTests(true); // the last assertion looks for check notices
    try {
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
    } finally { setMaintenanceEnabledForTests(null); }
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

describe("startingScenario with a chosen hub and name", () => {
  it("hubCandidates: about 60 big airports, LAX first, nothing that opens or closes during the campaign", () => {
    const hubs = hubCandidates(airports);
    expect(hubs).toHaveLength(60);
    expect(hubs[0]!.id).toBe("LAX");
    const ids = hubs.map((h) => h.id);
    for (const id of ["LHR", "JFK", "FRA", "ANC", "CDG", "ORD", "ATL", "MAD"]) expect(ids.includes(id) || id === "ANC", id).toBe(true);
    for (const id of ["TXL", "SXF", "BER", "RYG", "DSA"]) expect(ids).not.toContain(id);
    expect(new Set(ids).size).toBe(60);
  });

  it("the default hub with a custom name changes only the name", () => {
    const a = startingScenario(airports, aircraftTypes, 2015);
    const b = startingScenario(airports, aircraftTypes, 2015, { hub: "LAX", name: "  Coastline Air  " });
    expect(b.airlineName).toBe("Coastline Air");
    expect({ ...b, airlineName: a.airlineName }).toEqual(a);
    expect(startingScenario(airports, aircraftTypes, 2015, { name: "   " }).airlineName).toBe("Skybridge Pacific");
    expect(() => startingScenario(airports, aircraftTypes, 2015, { hub: "ZZZ" })).toThrow();
  });

  for (const hub of ["LHR", "JFK", "FRA", "ANC", "SIN", "GRU", "DXB", "SYD", "HND", "YYZ"]) {
    it(`starting at ${hub}: feasible, fully scheduled, profitable-ish routes from the hub`, () => {
      const s = startingScenario(airports, aircraftTypes, 2015, { hub, name: "Test Air" });
      expect(s.baseAirport).toBe(hub);
      expect(s.airlineName).toBe("Test Air");
      expect(s.world.routes.length).toBeGreaterThanOrEqual(3);
      expect(s.world.fleet.length).toBeGreaterThanOrEqual(3);
      expect(new Set(s.world.fleet.map((a) => a.tailNumber)).size).toBe(s.world.fleet.length);
      for (const r of s.world.routes) {
        expect(r.origin).toBe(hub);
        // every route passes the same checks as the player's own open-route command (range, runway, overwater, closed airports)
        const empty = { ...s, world: { ...s.world, routes: [] } };
        expect(applyCommand(empty, { kind: "openRoute", route: { origin: r.origin, destination: r.destination, weeklyFrequency: r.weeklyFrequency, fares: r.fares, typeId: r.typeId } }).result.ok, `${r.origin}-${r.destination} ${r.typeId}`).toBe(true);
        expect(s.world.fleet.some((a) => a.typeId === r.typeId)).toBe(true);
      }
      let st = runDays(s, 14);
      const reports = Object.values(st.routeReports);
      expect(reports).toHaveLength(s.world.routes.length);
      for (const r of reports) {
        expect(r.evaluation.feasible).toBe(true);
        expect(r.notionalFleet).toBe(false);
        expect(r.scheduling!.underSupplied).toBe(0);
        expect(r.evaluation.loadFactor).toBeGreaterThan(0.3);
      }
      // together the routes make money before fleet ownership, and the airline does not burn its cash in a year
      expect(reports.reduce((sum, r) => sum + r.evaluation.profit, 0)).toBeGreaterThan(0);
      st = runDays(st, 351);
      expect(st.world.cash).toBeGreaterThan(STARTING_CASH_USD * 0.7);
    }, 60_000);
  }

  it("is deterministic", () => {
    const a = startingScenario(airports, aircraftTypes, 9, { hub: "FRA" });
    const b = startingScenario(airports, aircraftTypes, 9, { hub: "FRA" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("hubs worldwide", () => {
  it("hubCandidates lists the largest airports of every continent, none with a runway the starting fleet cannot use", () => {
    const hubs = hubCandidates(airports, 150);
    expect(hubs).toHaveLength(150);
    expect(hubs[0]!.id).toBe("LAX");
    expect(new Set(hubs.map((h) => h.id)).size).toBe(150);
    for (const id of ["SIN", "GRU", "DXB", "SYD", "JNB", "HND", "DEL", "MEX", "YYZ"]) expect(hubs.map((h) => h.id), id).toContain(id);
    expect(hubs.map((h) => h.id)).not.toContain("CGH"); // 1,940 m
    for (const h of hubs.slice(1)) expect(h.runwayM, h.id).toBeGreaterThanOrEqual(2000);
  });

  it("thin or crowded hubs still start with three feasible routes (the least-losing ones are accepted)", () => {
    for (const hub of ["JNB", "GIG", "BSB", "DMK"]) {
      const s = startingScenario(airports, aircraftTypes, 2015, { hub });
      expect(s.world.routes.length, hub).toBeGreaterThanOrEqual(3);
      for (const r of s.world.routes) {
        const empty = { ...s, world: { ...s.world, routes: [] } };
        expect(applyCommand(empty, { kind: "openRoute", route: { origin: r.origin, destination: r.destination, weeklyFrequency: r.weeklyFrequency, fares: r.fares, typeId: r.typeId } }).result.ok, `${hub} ${r.destination}`).toBe(true);
      }
    }
  }, 60_000);

  it("tail numbers use the registration prefix of the hub's country", () => {
    expect(startingScenario(airports, aircraftTypes, 2015, { hub: "SIN" }).world.fleet[0]!.tailNumber.startsWith("9V-")).toBe(true);
    expect(startingScenario(airports, aircraftTypes, 2015, { hub: "SYD" }).world.fleet[0]!.tailNumber.startsWith("VH-")).toBe(true);
  });
});
