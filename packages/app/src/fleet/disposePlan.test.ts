import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { applyCommand, defaultLayout, startingScenario, type SimState } from "@arg/sim";
import { disposeOptions, planDisposal } from "./disposePlan";
import type { FleetItem } from "../sim/bridge";

const item = (o: Partial<FleetItem>): FleetItem => ({ id: "a", tail: "N1", typeId: "B737-800", typeName: "B737-800", status: "active", ageYears: 1, seats: 160, routes: [], ...o });

/** A route-less airline owning two purchased B737-800 and one leased A320, all delivered. */
function airline(): { sim: SimState; owned: string[]; leased: string } {
  let sim = startingScenario(airports, aircraftTypes, 3);
  sim = { ...sim, world: { ...sim.world, routes: [], cash: 1e9 }, routeReports: {} };
  const buy = (typeId: string, count: number, financing: "purchase" | "lease") => {
    const r = applyCommand(sim, { kind: "orderAircraft", typeId, count, layout: defaultLayout(aircraftTypes.find((t) => t.id === typeId)!), financing });
    if (!r.result.ok) throw new Error(r.result.message);
    const ids = r.result.aircraftIds;
    sim = { ...r.state, world: { ...r.state.world, fleet: r.state.world.fleet.map((a) => (ids.includes(a.id) ? { ...a, status: "active" as const } : a)) } };
    return ids;
  };
  const owned = buy("B737-800", 2, "purchase");
  const [leased] = buy("A320", 1, "lease");
  return { sim, owned, leased: leased! };
}

describe("disposeOptions", () => {
  it("offers Sell for owned, Return for leased, nothing for mock data", () => {
    expect(disposeOptions(item({ holding: "purchase" }))).toEqual({ action: "sell", blocker: null });
    expect(disposeOptions(item({ holding: "lease" }))).toEqual({ action: "return", blocker: null });
    expect(disposeOptions(item({}))).toBeNull();
  });
  it("blocks aircraft on routes, on order or in the hangar, with the reason", () => {
    expect(disposeOptions(item({ holding: "purchase", routes: ["LAX–SFO"] }))!.blocker).toMatch(/LAX–SFO.*take it off its routes first/);
    expect(disposeOptions(item({ holding: "lease", status: "delivery" }))!.blocker).toMatch(/cancel the order/);
    expect(disposeOptions(item({ holding: "lease", status: "maintenance" }))!.blocker).toMatch(/hangar/);
  });
});

describe("planDisposal", () => {
  it("totals a bulk sale exactly as the commands would pay it, and shows the credit line effect", () => {
    const { sim, owned } = airline();
    const plan = planDisposal(sim, owned.map((id) => ({ id })), "sell");
    expect(plan.count).toBe(2);
    expect(plan.proceedsUsd).toBeGreaterThan(0);
    expect(plan.creditLimitAfterUsd).toBeLessThan(plan.creditLimitBeforeUsd);
    let s = sim;
    for (const id of owned) s = applyCommand(s, { kind: "sellAircraft", aircraftId: id }).state;
    expect(s.world.cash).toBeCloseTo(plan.cashAfterUsd, 2);
    expect(s.world.cash - sim.world.cash).toBeCloseTo(plan.proceedsUsd, 2);
  });

  it("lists refused aircraft with the sim's reason and does not count them", () => {
    const { sim, owned, leased } = airline();
    const plan = planDisposal(sim, [{ id: owned[0]! }, { id: leased }], "sell");
    expect(plan.count).toBe(1);
    const bad = plan.lines.find((l) => l.id === leased)!;
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/leased/);
  });

  it("prices a lease return as a fee and reports the monthly saving and the type overhead saved", () => {
    const { sim, leased } = airline();
    const plan = planDisposal(sim, [{ id: leased }], "return");
    expect(plan.count).toBe(1);
    expect(plan.feeUsd).toBeGreaterThan(0);
    expect(plan.netUsd).toBe(-plan.feeUsd);
    expect(plan.monthlySavingUsd).toBeGreaterThan(0);
    expect(plan.cashAfterUsd).toBeCloseTo(sim.world.cash - plan.feeUsd, 2);
  });
});
