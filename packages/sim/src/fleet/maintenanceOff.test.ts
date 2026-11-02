import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import {
  applyCommand, defaultLayout, drainEvents, forecastFleet, MAINTENANCE_ENABLED, maintenanceEnabled, startingScenario, stepDay, suggestLayouts,
  setMaintenanceEnabledForTests, simulateRouteWeek,
} from "../index";

// No setMaintenanceEnabledForTests(true) at module scope in this file: it tests the shipped default.

describe("maintenance switched off (MAINTENANCE_ENABLED = false)", () => {
  it("is off by default", () => {
    expect(MAINTENANCE_ENABLED).toBe(false);
    expect(maintenanceEnabled()).toBe(false);
  });

  it("a 3-year run has zero maintenance events, no accruing clocks and no check costs", () => {
    let s = startingScenario(airports, aircraftTypes, 2015);
    const before = JSON.stringify(Object.values(s.fleetMeta).map((m) => m.daysSince));
    const hoursBefore = s.world.fleet.map((a) => a.hoursSinceCheck.A);
    let maintenanceNotices = 0;
    let inMaintenance = 0;
    const count = (events: ReturnType<typeof drainEvents>["events"]) =>
      events.filter((e) => e.kind === "notice" && /check|maintenance/i.test(e.text)).length;
    for (let d = 0; d < 3 * 365; d++) {
      s = stepDay(s);
      if (d % 30 === 0) {
        const drained = drainEvents(s);
        s = drained.state;
        maintenanceNotices += count(drained.events);
      }
      for (const a of s.world.fleet) if (a.status === "maintenance") inMaintenance++;
    }
    maintenanceNotices += count(drainEvents(s).events);
    expect(inMaintenance).toBe(0);
    expect(maintenanceNotices).toBe(0);
    expect(Object.values(s.fleetMeta).every((m) => m.maintenance === null && m.deferredDays === 0)).toBe(true);
    expect(JSON.stringify(Object.values(s.fleetMeta).map((m) => m.daysSince))).toBe(before);
    expect(s.world.fleet.map((a) => a.hoursSinceCheck.A)).toEqual(hoursBefore);
    // flying and finance carry on: aircraft still fly and the ledger carries no maintenance cost, but ownership is still charged
    expect(Object.values(s.fleetMeta).some((m) => m.flightHours > 0)).toBe(true);
    for (const rep of Object.values(s.routeReports)) {
      const line = rep.evaluation.lines.find((l) => l.key === "maintenance");
      expect(line?.weekly ?? 0).toBe(0);
    }
    expect(s.snapshots.at(-1)!.costs).toBeGreaterThan(0);
  });

  it("the planner forecast shows no check windows or A checks", () => {
    const s = startingScenario(airports, aircraftTypes, 2015);
    const fc = forecastFleet(s, 3 * 365);
    for (const f of Object.values(fc.aircraft)) {
      expect(f.windows).toEqual([]);
      expect(f.aChecks).toEqual([]);
    }
  });

  it("cabin refits still work without a check slot", () => {
    const s0 = startingScenario(airports, aircraftTypes, 1);
    const ac = s0.world.fleet.find((a) => a.typeId === "A320")!;
    const type = aircraftTypes.find((t) => t.id === "A320")!;
    const layout = suggestLayouts(type)[0]!.layout;
    const { state, result } = applyCommand(s0, { kind: "refitAircraft", aircraftId: ac.id, layout });
    expect(result.ok).toBe(true);
    expect(forecastFleet(state, 30).aircraft[ac.id]!.windows.map((w) => w.kind)).toEqual(["refit"]);
    let s = state;
    for (let i = 0; i < 3; i++) s = stepDay(s);
    expect(s.world.fleet.find((a) => a.id === ac.id)!.status).toBe("maintenance");
    for (let i = 0; i < 6; i++) s = stepDay(s);
    expect(s.world.fleet.find((a) => a.id === ac.id)!.status).toBe("active");
    expect(s.world.fleet.find((a) => a.id === ac.id)!.layout).toEqual(layout);
  });

  it("an aircraft left in a heavy check by an older save returns to service at once", () => {
    let s = startingScenario(airports, aircraftTypes, 3);
    const ac = s.world.fleet[0]!;
    s = {
      ...s,
      world: { ...s.world, fleet: s.world.fleet.map((a) => (a.id === ac.id ? { ...a, status: "maintenance" as const } : a)) },
      fleetMeta: { ...s.fleetMeta, [ac.id]: { ...s.fleetMeta[ac.id]!, maintenance: { check: "C" as const, startDay: 0, endDay: 21, cost: 1e6 } } },
    };
    s = stepDay(s);
    expect(s.world.fleet.find((a) => a.id === ac.id)!.status).toBe("active");
    expect(s.fleetMeta[ac.id]!.maintenance).toBeNull();
  });

  it("the per-hour maintenance cost line is zero off and positive on", () => {
    const A = new Map(airports.map((a) => [a.id, a]));
    const T = new Map(aircraftTypes.map((t) => [t.id, t]));
    const t = T.get("B737-800")!;
    const ac = { id: "x", typeId: t.id, tailNumber: "x", layout: defaultLayout(t), status: "active" as const, ageDays: 10, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 } };
    const route = { id: "r", origin: "LAX", destination: "SFO", typeId: t.id, weeklyFrequency: 14, fares: { Y: 120 } } as never;
    const line = () => simulateRouteWeek(route, A, T, 10, { fleetAircraft: [ac] })!.evaluation.lines.find((l) => l.key === "maintenance")!.weekly;
    expect(line()).toBe(0);
    setMaintenanceEnabledForTests(true);
    try { expect(line()).toBeGreaterThan(0); } finally { setMaintenanceEnabledForTests(null); }
  });
});
