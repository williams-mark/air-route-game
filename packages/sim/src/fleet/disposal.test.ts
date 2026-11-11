import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Aircraft } from "@arg/contracts";
import {
  aircraftBookValueUsd, applyCommand, creditLimitUsd, DISPOSAL_PARAMS, diversityOf, DIVERSITY_PARAMS, defaultLayout, disposalQuote, FINANCING_PARAMS,
  fleetDiversity, isObsolete, leasePaymentMonthlyUsd, makeSave, monthlyOwnershipUsd, parseSave, routesFlownBy, runDays, saleValueUsd, startingScenario, stepDay,
  validateSimState, type SimState,
} from "../index";

const type = (id: string) => aircraftTypes.find((t) => t.id === id)!;
const fresh = (seed = 1): SimState => startingScenario(airports, aircraftTypes, seed);
/** No routes, so nothing is "on a route". */
const idle = (s: SimState): SimState => ({ ...s, world: { ...s.world, routes: [] }, routeReports: {} });

/** Buy and deliver `count` aircraft at once (status active, age `ageDays`), the way the credit tests do. */
function own(s: SimState, typeId: string, count: number, financing: "purchase" | "lease" = "purchase", ageDays = 0): { state: SimState; ids: string[] } {
  const r = applyCommand(s, { kind: "orderAircraft", typeId, count, layout: defaultLayout(type(typeId)), financing });
  if (!r.result.ok) throw new Error(r.result.message);
  const ids = r.result.aircraftIds;
  const state: SimState = {
    ...r.state,
    world: { ...r.state.world, fleet: r.state.world.fleet.map((a) => (ids.includes(a.id) ? { ...a, status: "active" as const, ageDays } : a)) },
    fleetMeta: Object.fromEntries(Object.entries(r.state.fleetMeta).map(([id, m]) => [id, ids.includes(id) ? { ...m, deliveryDay: null } : m])),
  };
  return { state, ids };
}
const sellable = () => { const o = own(idle(fresh()), "B737-800", 1); return { ...o, id: o.ids[0]! }; };

describe("sell command", () => {
  it("pays the depreciated, market-adjusted value into cash and logs it", () => {
    const { state, id } = sellable();
    const q = disposalQuote(state, id, "sell");
    expect(q.ok).toBe(true);
    const ac = state.world.fleet.find((a) => a.id === id)!;
    const expected = saleValueUsd(state, ac, type("B737-800"));
    const r = applyCommand(state, { kind: "sellAircraft", aircraftId: id });
    expect(r.result.ok && r.result.proceedsUsd).toBeCloseTo(expected, 2);
    expect(r.state.world.cash).toBeCloseTo(state.world.cash + expected, 2);
    expect(r.state.world.fleet.some((a) => a.id === id)).toBe(false);
    expect(r.state.fleetMeta[id]).toBeUndefined();
    expect(r.state.orders.some((o) => o.aircraftIds.includes(id))).toBe(false);
    expect(r.state.world.cashLog!.at(-1)).toMatchObject({ amountUsd: expected });
    expect(r.state.pendingEvents.at(-1)).toMatchObject({ kind: "notice" });
  });

  it("values by age, type and market: older is worth less, never below the residual, always below book", () => {
    const t = type("B737-800");
    const v = (ageDays: number) => { const o = own(idle(fresh()), "B737-800", 1, "purchase", ageDays); return saleValueUsd(o.state, o.state.world.fleet.find((a) => a.id === o.ids[0])!, t); };
    const newV = v(0), mid = v(15 * 365.25), old = v(29 * 365.25);
    expect(newV).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0.1 * t.listPriceUsdM * 1e6);
    expect(newV).toBeLessThan(aircraftBookValueUsd(t, 0) * DISPOSAL_PARAMS.marketFactor + 1);
    // widebodies sell at a further discount to book
    const w = own(idle(fresh()), "B777-300ER", 1);
    const wt = type("B777-300ER");
    const paidRatio = 1 - w.state.orders.at(-1)!.discount; // a single new aircraft is worth less than book, so the price paid is the cap
    expect(saleValueUsd(w.state, w.state.world.fleet.find((a) => a.id === w.ids[0])!, wt) / aircraftBookValueUsd(wt, 0) / paidRatio)
      .toBeCloseTo(DISPOSAL_PARAMS.marketFactor * DISPOSAL_PARAMS.widebodyFactor * (isObsolete(wt, 0) ? DISPOSAL_PARAMS.obsoleteFactor : 1), 6);
  });

  it("never earns money on a bulk-discount order sold at once (value is capped by the price paid)", () => {
    const rich = (s: SimState): SimState => ({ ...s, world: { ...s.world, cash: 5e9 } });
    const o = own(rich(idle(fresh())), "A320", 20); // 20 aircraft: about 26% off list
    const order = o.state.orders.at(-1)!;
    const ac = o.state.world.fleet.find((a) => a.id === o.ids[0])!;
    expect(order.discount).toBeGreaterThan(0.25);
    expect(saleValueUsd(o.state, ac, type("A320"))).toBeLessThan(order.unitPriceUsd);
    expect(saleValueUsd(o.state, ac, type("A320"))).toBeLessThan(aircraftBookValueUsd(type("A320"), 0) * (1 - order.discount));
  });

  it("sale reduces the credit-line collateral", () => {
    const { state, id } = sellable();
    const before = creditLimitUsd(state);
    const r = applyCommand(state, { kind: "sellAircraft", aircraftId: id });
    const after = creditLimitUsd(r.state);
    expect(before - after).toBeCloseTo(0.5 * aircraftBookValueUsd(type("B737-800"), 0), 0);
    expect(r.result.ok && r.result.creditLimitAfterUsd).toBeCloseTo(after, 0);
  });

  it("keeps the order consistent when one aircraft of several is sold (count, deposit, ids)", () => {
    const o = own(idle(fresh()), "B737-800", 3);
    const order = o.state.orders.at(-1)!;
    const r = applyCommand(o.state, { kind: "sellAircraft", aircraftId: o.ids[1]! });
    expect(r.result.ok).toBe(true);
    const next = r.state.orders.find((x) => x.id === order.id)!;
    expect(next.count).toBe(2);
    expect(next.aircraftIds).toEqual([o.ids[0], o.ids[2]]);
    expect(next.deliveryDays).toHaveLength(2);
    expect(next.depositUsd).toBeCloseTo((order.depositUsd * 2) / 3, 2);
  });

  it("refuses an aircraft that flies a route, naming the route", () => {
    const s = fresh();
    const flying = s.world.fleet.find((a) => routesFlownBy(s, a.id).length > 0)!;
    expect(flying).toBeDefined();
    const owned: SimState = { ...s, world: { ...s.world, fleet: s.world.fleet.map((a) => (a.id === flying.id ? { ...a, financing: "purchase" as const } : a)) } };
    const r = applyCommand(owned, { kind: "sellAircraft", aircraftId: flying.id });
    expect(r.result).toMatchObject({ ok: false, error: "aircraft_on_route" });
    expect(!r.result.ok && r.result.message).toContain(routesFlownBy(owned, flying.id)[0]);
    expect(!r.result.ok && r.result.message).toMatch(/first/);
    expect(r.state).toBe(owned);
  });

  it("refuses a pinned aircraft, a leased aircraft, one on order, one in the hangar and unknown ids", () => {
    const { state, id } = sellable();
    const route = fresh().world.routes[0]!;
    const pinned: SimState = { ...state, world: { ...state.world, routes: [route] }, planner: { pins: { [id]: [{ routeId: route.id }] }, routeTypes: {}, reserved: {}, ignoredGaps: [] } };
    expect(applyCommand(pinned, { kind: "sellAircraft", aircraftId: id }).result).toMatchObject({ ok: false, error: "aircraft_on_route" });

    const leased = own(idle(fresh()), "B737-800", 1, "lease");
    expect(applyCommand(leased.state, { kind: "sellAircraft", aircraftId: leased.ids[0]! }).result).toMatchObject({ ok: false, error: "leased_aircraft" });
    const legacy = idle(fresh()).world.fleet[0]!; // starting fleet: lease-equivalent
    expect(applyCommand(idle(fresh()), { kind: "sellAircraft", aircraftId: legacy.id }).result).toMatchObject({ ok: false, error: "leased_aircraft" });

    const ordered = applyCommand(idle(fresh()), { kind: "orderAircraft", typeId: "B737-800", count: 1, layout: defaultLayout(type("B737-800")), financing: "purchase" });
    const onOrder = ordered.result.ok ? ordered.result.aircraftIds[0]! : "";
    expect(applyCommand(ordered.state, { kind: "sellAircraft", aircraftId: onOrder }).result).toMatchObject({ ok: false, error: "aircraft_unavailable" });

    const hangar: SimState = { ...state, world: { ...state.world, fleet: state.world.fleet.map((a) => (a.id === id ? { ...a, status: "maintenance" as const } : a)) } };
    expect(applyCommand(hangar, { kind: "sellAircraft", aircraftId: id }).result).toMatchObject({ ok: false, error: "aircraft_unavailable" });
    expect(applyCommand(state, { kind: "sellAircraft", aircraftId: "nope" }).result).toMatchObject({ ok: false, error: "unknown_aircraft" });
  });

  it("refuses a sale that would leave cash beyond a credit line the sale itself shrinks", () => {
    // A cheaply bought (deeply discounted) aircraft: the dealer pays little but the credit line counts it at list-based book value.
    const { state, id } = sellable();
    const cheap: SimState = { ...state, orders: state.orders.map((o) => ({ ...o, unitPriceUsd: o.unitPriceUsd * 0.2 })) };
    const limit = creditLimitUsd(cheap);
    const tight: SimState = { ...cheap, world: { ...cheap.world, cash: -limit + 1_000_000 } }; // just inside the line
    const r = applyCommand(tight, { kind: "sellAircraft", aircraftId: id });
    expect(r.result).toMatchObject({ ok: false, error: "credit_limit" });
    expect(!r.result.ok && r.result.message).toMatch(/would not help/);
    expect(r.state).toBe(tight);
    // With plenty of cash the same sale is fine.
    expect(applyCommand(cheap, { kind: "sellAircraft", aircraftId: id }).result.ok).toBe(true);
  });

  it("is a cure for distress: selling brings a distressed airline back within its line", () => {
    const { state, id } = sellable();
    const limit = creditLimitUsd(state);
    const ac = state.world.fleet.find((a) => a.id === id)!;
    const proceeds = saleValueUsd(state, ac, type("B737-800"));
    const lost = 0.5 * aircraftBookValueUsd(type("B737-800"), 0);
    // Just beyond the line by less than the sale gains (proceeds minus the collateral lost).
    const s: SimState = { ...state, world: { ...state.world, cash: -limit - (proceeds - lost) / 2 } };
    const distressed = stepDay(s);
    expect(distressed.credit!.distressSinceDay).not.toBeNull();
    const sold = applyCommand(distressed, { kind: "sellAircraft", aircraftId: id });
    expect(sold.result.ok).toBe(true);
    const after = stepDay(sold.state);
    expect(after.credit!.distressSinceDay).toBeNull();
    expect(after.pendingEvents.some((e) => e.kind === "notice" && /Distress over/.test(e.text))).toBe(true);
  });

  it("distress notices mention selling", () => {
    const s = stepDay({ ...fresh(), world: { ...fresh().world, cash: -200_000_000 } });
    expect(s.pendingEvents.some((e) => e.kind === "notice" && /sell idle aircraft/.test(e.text))).toBe(true);
  });
});

describe("lease return", () => {
  const leasedIdle = () => { const o = own(idle(fresh()), "A320", 1, "lease"); return { ...o, id: o.ids[0]! }; };

  it("charges a termination fee of N months of lease and stops the lease cost", () => {
    const { state, id } = leasedIdle();
    const ac = state.world.fleet.find((a) => a.id === id)!;
    const monthly = leasePaymentMonthlyUsd(state, ac, type("A320"));
    const order = state.orders.at(-1)!;
    expect(monthly).toBeCloseTo(monthlyOwnershipUsd(type("A320")) * order.ownershipFactor!, 2);
    const r = applyCommand(state, { kind: "returnLease", aircraftId: id });
    expect(r.result.ok && r.result.feeUsd).toBeCloseTo(DISPOSAL_PARAMS.leaseTerminationMonths * monthly, 2);
    expect(r.state.world.cash).toBeCloseTo(state.world.cash - DISPOSAL_PARAMS.leaseTerminationMonths * monthly, 2);
    expect(r.state.world.fleet.some((a) => a.id === id)).toBe(false);
    const perDay = (x: SimState) => stepDay(x).snapshots.at(-1)!.costs;
    const saved = perDay(state) - perDay(r.state);
    expect(saved).toBeCloseTo(monthly / 30.4375 + 600 * (1 + FINANCING_PARAMS.leaseOperatingUplift), 0);
  });

  it("also returns starting-fleet and offer aircraft (they pay the lease-equivalent), and refuses owned, on-route and on-order aircraft", () => {
    const base = idle(fresh());
    const legacy = base.world.fleet[0]!;
    expect(applyCommand(base, { kind: "returnLease", aircraftId: legacy.id }).result.ok).toBe(true);
    const owned = sellable();
    expect(applyCommand(owned.state, { kind: "returnLease", aircraftId: owned.id }).result).toMatchObject({ ok: false, error: "not_leased" });
    const s = fresh();
    const flying = s.world.fleet.find((a) => routesFlownBy(s, a.id).length > 0)!;
    expect(applyCommand(s, { kind: "returnLease", aircraftId: flying.id }).result).toMatchObject({ ok: false, error: "aircraft_on_route" });
    const ordered = applyCommand(base, { kind: "orderAircraft", typeId: "A320", count: 1, layout: defaultLayout(type("A320")), financing: "lease" });
    expect(applyCommand(ordered.state, { kind: "returnLease", aircraftId: ordered.result.ok ? ordered.result.aircraftIds[0]! : "" }).result).toMatchObject({ ok: false, error: "aircraft_unavailable" });
  });

  it("refuses a fee that cash and credit cannot cover", () => {
    const { state, id } = leasedIdle();
    const broke: SimState = { ...state, world: { ...state.world, cash: -creditLimitUsd(state) } };
    expect(applyCommand(broke, { kind: "returnLease", aircraftId: id }).result).toMatchObject({ ok: false, error: "insufficient_cash" });
  });

  it("folds the fee into an overdraft that stays within the credit line", () => {
    const { state, id } = leasedIdle();
    const q = disposalQuote(state, id, "return");
    if (!q.ok) throw new Error(q.message);
    const limit = creditLimitUsd(state);
    const overdrawn: SimState = { ...state, world: { ...state.world, cash: -(limit - q.feeUsd) + 1 } };
    const r = applyCommand(overdrawn, { kind: "returnLease", aircraftId: id });
    expect(r.result.ok).toBe(true);
    expect(r.state.world.cash).toBeCloseTo(overdrawn.world.cash - q.feeUsd, 2);
    expect(r.state.world.cashLog!.at(-1)!.amountUsd).toBeCloseTo(-q.feeUsd, 2);
  });

  it("in distress (cash beyond the line) still allows the return when it pays back within a year, so the fleet can be cured", () => {
    const { state, id } = leasedIdle();
    const distressed: SimState = { ...state, world: { ...state.world, cash: -creditLimitUsd(state) - 5e6 } };
    const q = disposalQuote(distressed, id, "return");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.feeUsd).toBeLessThanOrEqual(DISPOSAL_PARAMS.distressReturnPaybackMonths * q.monthlySavingUsd);
    const r = applyCommand(distressed, { kind: "returnLease", aircraftId: id });
    expect(r.result.ok).toBe(true);
    expect(r.state.world.cash).toBeCloseTo(distressed.world.cash - q.feeUsd, 2);
    // Cash identity: the next day's cash change equals that day's profit.
    const next = stepDay(r.state);
    expect(next.world.cash - r.state.world.cash).toBeCloseTo(next.snapshots.at(-1)!.profit, 0);
  });
});

describe("fleet diversity cost", () => {
  const types12 = aircraftTypes.filter((t) => t.introYear <= 2015 && (t.endYear === null || t.endYear >= 2015)).slice(0, 12).map((t) => t.id);
  /** A fleet of `total` active aircraft spread evenly over `ids`, no routes. */
  function fleetOf(ids: string[], total: number): SimState {
    const base = idle(fresh());
    const fleet: Aircraft[] = Array.from({ length: total }, (_, i) => {
      const t = type(ids[i % ids.length]!);
      return { id: `x-${i}`, typeId: t.id, tailNumber: `N${i}`, layout: defaultLayout(t), status: "active", ageDays: 1000, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 }, financing: "purchase" };
    });
    return { ...base, world: { ...base.world, fleet }, fleetMeta: {}, orders: [] };
  }

  it("is free up to the allowance and counts only delivered aircraft", () => {
    const f = diversityOf(fleetOf(types12.slice(0, DIVERSITY_PARAMS.freeTypes), 8).world.fleet);
    expect(f).toMatchObject({ types: DIVERSITY_PARAMS.freeTypes, extraTypes: 0, monthlyUsd: 0 });
    const withOrder = fleetOf(types12.slice(0, DIVERSITY_PARAMS.freeTypes), 8);
    const extra: Aircraft = { ...withOrder.world.fleet[0]!, id: "o", typeId: types12[11]!, status: "delivery" };
    expect(fleetDiversity({ world: { ...withOrder.world, fleet: [...withOrder.world.fleet, extra] } }).extraTypes).toBe(0);
  });

  it("charges extra types by a fixed amount plus an amount per aircraft", () => {
    const d = diversityOf(fleetOf(types12.slice(0, DIVERSITY_PARAMS.freeTypes + 2), 20).world.fleet);
    expect(d.extraTypes).toBe(2);
    expect(d.monthlyUsd).toBe(2 * (DIVERSITY_PARAMS.perExtraTypeMonthlyUsd + 20 * DIVERSITY_PARAMS.perExtraTypePerAircraftMonthlyUsd));
  });

  it("3-type and 12-type fleets of the same size: the 12-type fleet pays clearly more per day, the 3-type fleet pays nothing", () => {
    const three = fleetOf(types12.slice(0, 3), 24), twelve = fleetOf(types12, 24);
    expect(three.world.fleet).toHaveLength(twelve.world.fleet.length);
    const a = stepDay(three), b = stepDay(twelve);
    expect(a.diversity).toBeUndefined();
    expect(b.diversity!.lastUsd).toBeGreaterThan(0);
    const dIn = diversityOf(twelve.world.fleet);
    expect(dIn.extraTypes).toBe(12 - DIVERSITY_PARAMS.freeTypes);
    // The commonality line is exactly the cost the fleet pays in addition (type prices differ, so compare it, not the totals).
    expect(b.diversity!.lastUsd).toBeCloseTo(dIn.dailyUsd, 6);
    // Modest at 5 types, painful at 12: about 1% of what a 24-aircraft airline earns at 5, several per cent at 12.
    const revenueMonthly = 24 * 2.6e6;
    expect(diversityOf(fleetOf(types12.slice(0, 5), 24).world.fleet).monthlyUsd / revenueMonthly).toBeLessThan(0.012);
    expect(dIn.monthlyUsd / revenueMonthly).toBeGreaterThan(0.05);
  });

  it("is part of the day's costs, so the cash identity holds", () => {
    const s = fleetOf(types12, 24);
    const n = stepDay(s);
    expect(n.world.cash).toBeCloseTo(s.world.cash + n.snapshots.at(-1)!.profit, 2);
    const total = runDays(s, 10);
    expect(total.diversity!.totalUsd).toBeCloseTo(10 * diversityOf(s.world.fleet).dailyUsd, 2);
  });

  it("a single-type airline is byte-identical to one without the feature (no diversity state)", () => {
    const one = fleetOf([types12[0]!], 6);
    const run = runDays(one, 40);
    expect(run.diversity).toBeUndefined();
    expect("diversity" in run).toBe(false);
  });

  it("the starting fleet (4 types) pays nothing", () => {
    const run = runDays(fresh(), 30);
    expect(run.diversity).toBeUndefined();
  });
});

describe("determinism and saves", () => {
  it("sale and return sequences replay to identical states", () => {
    const play = () => {
      const a = own(idle(fresh(5)), "B737-800", 3);
      let s = a.state;
      s = applyCommand(s, { kind: "sellAircraft", aircraftId: a.ids[0]! }).state;
      s = applyCommand(s, { kind: "returnLease", aircraftId: idle(fresh(5)).world.fleet[0]!.id }).state;
      return JSON.stringify(runDays(s, 60));
    };
    expect(play()).toBe(play());
  });

  it("a state with diversity data round-trips through a save and validates", () => {
    const base = idle(fresh());
    const types = aircraftTypes.slice(0, 7);
    const fleet: Aircraft[] = types.map((t, i) => ({ id: `y-${i}`, typeId: t.id, tailNumber: `Y${i}`, layout: defaultLayout(t), status: "active", ageDays: 10, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 }, financing: "purchase" }));
    const s = runDays({ ...base, world: { ...base.world, fleet }, fleetMeta: {}, orders: [] }, 5);
    expect(s.diversity).toBeDefined();
    expect(validateSimState(JSON.parse(JSON.stringify(s)))).toEqual([]);
    expect(parseSave(JSON.stringify(makeSave(s, { appVersion: "t", savedAt: "2026-01-01T00:00:00Z" }))).ok).toBe(true);
  });
});
