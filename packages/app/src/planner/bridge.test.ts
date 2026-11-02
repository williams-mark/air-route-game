import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { coverageGaps, plannerDemoFleet } from "@arg/sim";
import { RealSimBridge } from "../sim/realBridge";

describe("planner through the real bridge", () => {
  it("exposes sim state and accepts planner commands with typed errors", () => {
    const b = new RealSimBridge({ startPaused: true, initial: plannerDemoFleet(airports, aircraftTypes, 4) });
    const sim = b.getSim();
    expect(sim.world.fleet.length).toBeGreaterThan(25);
    const wide = sim.world.fleet.find((a) => a.typeId === "B777-200ER")!;
    expect(b.dispatch({ kind: "pinAircraft", aircraftId: wide.id, routeId: "route-1" })).toEqual({ ok: true });
    expect(b.getSim().planner?.pins[wide.id]).toEqual([{ routeId: "route-1" }]);
    const bad = b.dispatch({ kind: "pinAircraft", aircraftId: wide.id, routeId: "nope" });
    expect(bad).toMatchObject({ ok: false, error: { code: "unknown_route" } });
    b.stepDays(10);
    expect(b.getState().reports["route-1"]!.scheduling!.aircraftIds).toContain(wide.id);
    expect(Array.isArray(coverageGaps(b.getSim(), 60))).toBe(true);
  });
});
