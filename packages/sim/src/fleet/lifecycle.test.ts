import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { SimState } from "../state";
import { dayToDate } from "../time/calendar";
import { applyCommand, defaultLayout, monthlyOwnershipUsd, startingScenario, stepDay } from "../index";
import { ageServicePenalty, FINANCING_PARAMS, isObsolete, isRetired, LIFECYCLE_PARAMS, obsolescenceMultiplier } from "./lifecycle";

const type = (id: string) => aircraftTypes.find((t) => t.id === id)!;
const sc = () => startingScenario(airports, aircraftTypes, 1);
const DAYS_PER_YEAR = 365.25;

/** First sim day in the given calendar year. */
function firstDayOf(year: number): number {
  for (let d = 0; ; d++) if (dayToDate(d).year === year) return d;
}

function order(s: SimState, financing: "purchase" | "lease" | undefined, typeId = "A320", count = 1) {
  return applyCommand(s, {
    kind: "orderAircraft", typeId, count, layout: defaultLayout(type(typeId)),
    ...(financing ? { financing } : {}),
  });
}

/** Step until nothing is on order; returns the state and the cash adjustment made on the delivery step (cash change not explained by profit). */
function runToDelivery(st: SimState): { state: SimState; deliveryAdjust: number } {
  let prev = st;
  for (let i = 0; i < 1500 && st.world.fleet.some((a) => a.status === "delivery"); i++) {
    prev = st;
    st = stepDay(st);
  }
  const profit = st.snapshots.at(-1)!.profit;
  return { state: st, deliveryAdjust: st.world.cash - prev.world.cash - profit };
}

describe("financing: purchase vs lease cash flow", () => {
  it("defaults to purchase and records the financing on the order and aircraft", () => {
    const { state, result } = order(sc(), undefined);
    expect(result.ok && result.financing).toBe("purchase");
    expect(state.orders.at(-1)!.financing).toBe("purchase");
    expect(state.world.fleet.find((a) => a.status === "delivery")!.financing).toBe("purchase");
  });

  it("purchase: 20% of the net price at order, the 80% balance at delivery", () => {
    const s0 = sc();
    const { state, result } = order(s0, "purchase");
    if (!result.ok) throw new Error("order failed");
    expect(result.depositUsd).toBeCloseTo(FINANCING_PARAMS.purchaseDownFraction * result.unitPriceUsd, 0);
    expect(state.world.cash).toBeCloseTo(s0.world.cash - 0.2 * result.unitPriceUsd, 0);
    const { deliveryAdjust } = runToDelivery(state);
    expect(deliveryAdjust).toBeCloseTo(-0.8 * result.unitPriceUsd, 0);
  });

  it("lease: 10% of list price at order, nothing extra due at delivery", () => {
    const s0 = sc();
    const { state, result } = order(s0, "lease");
    if (!result.ok) throw new Error("order failed");
    const list = type("A320").listPriceUsdM * 1e6;
    expect(result.depositUsd).toBeCloseTo(FINANCING_PARAMS.leaseDownFractionOfList * list, 0);
    expect(state.world.cash).toBeCloseTo(s0.world.cash - 0.1 * list, 0);
    const { deliveryAdjust } = runToDelivery(state);
    expect(deliveryAdjust).toBeCloseTo(0, 0);
  });

  it("lease pays the lease-equivalent plus a 15% uplift on the fixed per-aircraft cost; purchase pays neither lease nor a lease-equivalent", () => {
    const base = sc();
    const pBase = runToDelivery(order(base, "purchase").state).state;
    const lBase = runToDelivery(order(base, "lease").state).state;
    // Same day, same fleet of one delivered aircraft, no routes: the fleet cost difference is the lease-equivalent plus the uplift.
    const pNext = stepDay(pBase), lNext = stepDay(lBase);
    const pCost = pNext.snapshots.at(-1)!.costs, lCost = lNext.snapshots.at(-1)!.costs;
    const overhead = base.params.overheadPerAircraftPerDay;
    const t = type("A320");
    const ownershipFactor = lBase.orders.at(-1)!.ownershipFactor!;
    const expectedGap = (monthlyOwnershipUsd(t) * ownershipFactor) / 30.4375 + FINANCING_PARAMS.leaseOperatingUplift * overhead;
    expect(lCost - pCost).toBeCloseTo(expectedGap, 0);
  });
});

describe("hard lifespan cap", () => {
  it("isRetired is true from 30 years of simulated age", () => {
    expect(isRetired({ ageDays: 30 * DAYS_PER_YEAR - 1 })).toBe(false);
    expect(isRetired({ ageDays: 30 * DAYS_PER_YEAR })).toBe(true);
  });

  it("an aircraft reaching 30 years leaves the fleet on that day, with a notice, and is pruned from its order", () => {
    const { state, result } = order(sc(), "purchase");
    if (!result.ok) throw new Error("order failed");
    const delivered = runToDelivery(state).state;
    const id = result.aircraftIds[0]!;
    const aged = {
      ...delivered,
      world: { ...delivered.world, fleet: delivered.world.fleet.map((a) => (a.id === id ? { ...a, ageDays: 30 * DAYS_PER_YEAR - 1 } : a)) },
    };
    const next = stepDay(aged);
    expect(next.world.fleet.some((a) => a.id === id)).toBe(false);
    expect(next.fleetMeta[id]).toBeUndefined();
    expect(next.orders.at(-1)!.aircraftIds).not.toContain(id);
    expect(next.orders.at(-1)!.aircraftIds.length).toBe(next.orders.at(-1)!.deliveryDays.length);
    expect(next.pendingEvents.some((e) => e.kind === "notice" && e.text.includes("retired"))).toBe(true);
  });

  it("an aircraft just under 30 years stays", () => {
    const { state, result } = order(sc(), "purchase");
    if (!result.ok) throw new Error("order failed");
    const delivered = runToDelivery(state).state;
    const id = result.aircraftIds[0]!;
    const aged = {
      ...delivered,
      world: { ...delivered.world, fleet: delivered.world.fleet.map((a) => (a.id === id ? { ...a, ageDays: 30 * DAYS_PER_YEAR - 5 } : a)) },
    };
    expect(stepDay(aged).world.fleet.some((a) => a.id === id)).toBe(true);
  });
});

describe("obsolescence threshold", () => {
  it("applies 15 years after the type's production end year, not before", () => {
    const b757 = type("B757-200"); // endYear 2004
    expect(isObsolete(b757, firstDayOf(2018))).toBe(false);
    expect(isObsolete(b757, firstDayOf(2019))).toBe(true);
    expect(obsolescenceMultiplier(b757, firstDayOf(2018))).toBe(1);
    expect(obsolescenceMultiplier(b757, firstDayOf(2019))).toBeCloseTo(1 + LIFECYCLE_PARAMS.obsolescenceCostUplift, 10);
  });

  it("types still in production (endYear null) never become obsolete", () => {
    const a320neo = type("A320N");
    expect(a320neo.endYear).toBeNull();
    expect(isObsolete(a320neo, firstDayOf(2060))).toBe(false);
    expect(obsolescenceMultiplier(a320neo, firstDayOf(2060))).toBe(1);
  });

  it("raises the maintenance cost on the route ledger for an obsolete type only", () => {
    const b757 = type("B757-200");
    const before = firstDayOf(2018), after = firstDayOf(2019);
    expect(obsolescenceMultiplier(b757, after)).toBeGreaterThan(obsolescenceMultiplier(b757, before));
  });
});

describe("passenger service age penalty", () => {
  it("is zero up to 15 years and the penalty value beyond", () => {
    expect(ageServicePenalty({ ageDays: 15 * DAYS_PER_YEAR }, 100, 100)).toBe(0);
    expect(ageServicePenalty({ ageDays: 15 * DAYS_PER_YEAR + 1 }, 100, 100)).toBe(LIFECYCLE_PARAMS.servicePenalty);
    expect(ageServicePenalty({ ageDays: 20 * DAYS_PER_YEAR }, 100, 100)).toBe(LIFECYCLE_PARAMS.servicePenalty);
  });

  it("evaluates age on the requested day relative to the state's day", () => {
    // 15 years old exactly on day 100; 10 days later it is past the threshold.
    expect(ageServicePenalty({ ageDays: 15 * DAYS_PER_YEAR }, 100, 100)).toBe(0);
    expect(ageServicePenalty({ ageDays: 15 * DAYS_PER_YEAR }, 110, 100)).toBe(LIFECYCLE_PARAMS.servicePenalty);
  });

  it("is a pure function of its inputs", () => {
    const ac = { ageDays: 16 * DAYS_PER_YEAR };
    expect(ageServicePenalty(ac, 5, 5)).toBe(ageServicePenalty(ac, 5, 5));
  });
});
