import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Command } from "@arg/contracts";
import {
  applyCommand, CREDIT_PARAMS, creditLimitUsd, creditStatus, defaultLayout, isBankrupt, makeSave, parseSave, runDays, scheduledBalances,
  startingScenario, stepDay, type SimState,
} from "../index";

const fresh = (seed = 1): SimState => startingScenario(airports, aircraftTypes, seed);
const withCash = (s: SimState, cash: number): SimState => ({ ...s, world: { ...s.world, cash } });
const order = (typeId: string, count: number, financing: "purchase" | "lease" = "purchase"): Command =>
  ({ kind: "orderAircraft", typeId, count, layout: { sections: [] }, financing });

describe("credit limit", () => {
  it("is the base line at the start and grows with owned aircraft and revenue", () => {
    const s = fresh();
    expect(creditLimitUsd(s)).toBe(CREDIT_PARAMS.baseLimitUsd); // starting fleet is not pledgeable, no revenue yet
    const after = runDays(s, 30);
    expect(creditLimitUsd(after)).toBeGreaterThan(CREDIT_PARAMS.baseLimitUsd);
  });

  it("counts purchased aircraft as collateral once delivered, not while on order", () => {
    const s = fresh();
    const r = applyCommand(s, order("B737-800", 2));
    expect(r.result.ok).toBe(true);
    expect(creditLimitUsd(r.state)).toBe(creditLimitUsd(s));
    const t = aircraftTypes.find((x) => x.id === "B737-800")!;
    const delivered = { ...r.state, world: { ...r.state.world, fleet: r.state.world.fleet.map((a) => (a.status === "delivery" ? { ...a, status: "active" as const } : a)) } };
    expect(creditLimitUsd(delivered) - creditLimitUsd(s)).toBeCloseTo(2 * CREDIT_PARAMS.fleetAdvanceRate * t.listPriceUsdM * 1e6, 0);
  });
});

describe("order funding guard", () => {
  it("refuses an order whose deposit is affordable but whose delivery balances are not", () => {
    const s = fresh();
    const type = aircraftTypes.find((t) => t.id === "B737-800")!;
    let refused: { count: number; message: string } | null = null;
    let lastOk = 0;
    for (let n = 1; n <= 200; n++) {
      const { result } = applyCommand(s, order(type.id, n));
      if (result.ok) { lastOk = n; continue; }
      if (result.error === "insufficient_cash") break; // the deposit itself no longer fits: too far
      expect(result.error).toBe("credit_limit");
      refused = { count: n, message: result.message };
      break;
    }
    expect(refused).not.toBeNull();
    expect(lastOk).toBeGreaterThan(0);
    expect(refused!.message).toMatch(/Not fundable/);
    expect(refused!.message).toMatch(/credit line/);
    // The refused quantity has an affordable deposit, so only the balance rule stopped it.
    const unit = type.listPriceUsdM * 1e6 * (1 - 0.4);
    expect(unit * refused!.count * 0.2).toBeLessThan(s.world.cash);
  });

  it("counts balances already owed on open orders", () => {
    let s = fresh();
    let placed = 0;
    for (let i = 0; i < 40; i++) {
      const r = applyCommand(s, order("B737-800", 2));
      if (!r.result.ok) { expect(r.result.error).toMatch(/credit_limit|insufficient_cash/); break; }
      s = r.state; placed++;
    }
    expect(placed).toBeGreaterThan(0);
    expect(placed).toBeLessThan(40);
    const owed = scheduledBalances(s).reduce((a, b) => a + b.amountUsd, 0);
    expect(owed).toBeGreaterThan(0);
    expect(creditStatus(s).worstMarginUsd).toBeGreaterThanOrEqual(0);
    // ...and one more of the same size would not have fitted.
    expect(applyCommand(s, order("B737-800", 2)).result).toMatchObject({ ok: false });
  });

  it("does not refuse leases or small orders for want of a balance", () => {
    expect(applyCommand(fresh(), order("B737-800", 1, "lease")).result.ok).toBe(true);
    expect(applyCommand(fresh(), order("B737-800", 1)).result.ok).toBe(true);
  });
});

describe("overdraft interest", () => {
  it("charges the overdrawn amount daily at the stated rate, as a cost", () => {
    const a = stepDay(withCash(fresh(), 50_000_000));
    const b = stepDay(withCash(fresh(), -10_000_000));
    const expected = (10_000_000 * CREDIT_PARAMS.annualInterestRate) / 365;
    expect(a.credit).toBeUndefined();
    expect(b.snapshots[0]!.costs - a.snapshots[0]!.costs).toBeCloseTo(expected, 2);
    expect(b.credit!.lastInterestUsd).toBeCloseTo(expected, 2);
    // Cash identity: the interest is inside the day's profit.
    expect(b.world.cash).toBeCloseTo(-10_000_000 + b.snapshots[0]!.profit, 2);
  });

  it("accumulates while overdrawn and stops when cash is positive", () => {
    let s = runDays(withCash(fresh(), -10_000_000), 10);
    const paid = s.credit!.interestPaidUsd;
    expect(paid).toBeGreaterThan(10 * 0.8 * (10_000_000 * CREDIT_PARAMS.annualInterestRate) / 365);
    s = runDays(withCash(s, 80_000_000), 5);
    expect(s.credit!.interestPaidUsd).toBe(paid);
    expect(s.credit!.lastInterestUsd).toBe(0);
  });

  it("a game that never goes into the red has no credit state at all", () => {
    expect(runDays(fresh(), 60).credit).toBeUndefined();
  });
});

describe("distress and bankruptcy", () => {
  const notices = (s: SimState) => s.pendingEvents.filter((e) => e.kind === "notice").map((e) => (e as { text: string }).text);

  it("enters distress below minus the credit limit, with a notice", () => {
    const s = stepDay(withCash(fresh(), -200_000_000));
    expect(s.credit!.distressSinceDay).toBe(s.world.day);
    expect(notices(s).some((t) => /Financial distress/.test(t) && /90 days/.test(t))).toBe(true);
    const st = creditStatus(s);
    expect(st.distress).toEqual({ sinceDay: s.world.day, daysLeft: CREDIT_PARAMS.graceDays });
    expect(st.headroomUsd).toBeLessThan(0);
    expect(isBankrupt(s)).toBe(false);
  });

  it("reminds monthly and leaves distress when cash is back within the limit", () => {
    let s = stepDay(withCash(fresh(), -200_000_000));
    s = runDays({ ...s, pendingEvents: [] }, 31);
    expect(notices(s).filter((t) => /Still in distress/.test(t))).toHaveLength(1);
    s = stepDay({ ...withCash(s, 20_000_000), pendingEvents: [] });
    expect(s.credit!.distressSinceDay).toBeNull();
    expect(notices(s).some((t) => /Distress over/.test(t))).toBe(true);
  });

  it("cancelling a pending order relieves its balances and can cure distress", () => {
    const placed = applyCommand(fresh(), order("B737-800", 2));
    let s = placed.state;
    const owed = scheduledBalances(s).reduce((a, b) => a + b.amountUsd, 0);
    const c = applyCommand(s, { kind: "cancelOrder", orderId: s.orders[0]!.id });
    expect(c.result).toMatchObject({ ok: true, cancelled: 2 });
    s = c.state;
    expect(scheduledBalances(s)).toHaveLength(0);
    expect(s.orders).toHaveLength(0);
    expect(s.world.fleet.filter((a) => a.status === "delivery")).toHaveLength(0);
    expect(s.world.cash).toBe(placed.state.world.cash); // the deposit is gone for good
    expect(owed).toBeGreaterThan(0);
    expect(applyCommand(s, { kind: "cancelOrder", orderId: "order-99" }).result).toMatchObject({ ok: false, error: "unknown_order" });
  });

  it("fails the airline after the grace period, pauses the sim and refuses commands", () => {
    let s = withCash(fresh(), -300_000_000);
    s = { ...s, speed: 3 };
    s = stepDay(s);
    const since = s.credit!.distressSinceDay!;
    s = runDays(s, CREDIT_PARAMS.graceDays - 2);
    expect(isBankrupt(s)).toBe(false);
    s = runDays(s, 2);
    expect(isBankrupt(s)).toBe(true);
    expect(s.credit!.bankrupt!.day).toBe(since + CREDIT_PARAMS.graceDays);
    expect(s.speed).toBe(0);
    expect(notices(s).some((t) => /Bankruptcy/.test(t))).toBe(true);
    // Frozen: further steps change nothing; commands are refused.
    expect(stepDay(s)).toBe(s);
    expect(applyCommand(s, { kind: "setSpeed", speed: 1 }).result).toMatchObject({ ok: false, error: "bankrupt" });
    expect(applyCommand(s, order("B737-800", 1)).result).toMatchObject({ ok: false, error: "bankrupt" });
  });

  it("is deterministic and survives a save round trip", () => {
    const go = () => runDays(withCash(fresh(7), -300_000_000), 100);
    const a = go(), b = go();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(isBankrupt(a)).toBe(true);
    const parsed = parseSave(JSON.stringify(makeSave(a, { appVersion: "t", savedAt: "2026-01-01T00:00:00Z" })));
    expect(parsed.ok).toBe(true);
    const bad = parseSave(JSON.stringify({ ...makeSave(a, { appVersion: "t", savedAt: "x" }), state: { ...a, credit: { ...a.credit, interestPaidUsd: "lots" } } }));
    expect(bad.ok).toBe(false);
  });
});

describe("scripted play", () => {
  const widebody = "B777-300ER";
  const narrow = "B737-800";

  /** Reckless: leases and buys aircraft every month with all the money it can, never opens a route to use them. */
  function aggressive(s: SimState, refusals: { n: number }): SimState {
    for (const [typeId, financing] of [[widebody, "lease"], [narrow, "purchase"], [widebody, "purchase"]] as const) {
      for (let n = 40; n >= 1; n = Math.floor(n / 2)) {
        const r = applyCommand(s, order(typeId, n, financing));
        if (r.result.ok) { s = r.state; break; }
        if (r.result.error === "credit_limit") refusals.n++;
      }
    }
    return s;
  }

  it("a reckless over-ordering run ends in bankruptcy", () => {
    let s = fresh(3);
    const refusals = { n: 0 };
    for (let day = 0; day < 8 * 365 && !isBankrupt(s); day++) {
      if (day % 30 === 0) s = aggressive(s, refusals);
      s = stepDay(s);
    }
    expect(isBankrupt(s)).toBe(true);
    expect(s.speed).toBe(0);
    expect(refusals.n).toBeGreaterThan(0); // the guard was in play
  }, 240_000);

  it("a conservative run (one narrowbody a year, only when it is clearly affordable) never enters distress", () => {
    let s = fresh(3);
    for (let day = 0; day < 4 * 365; day++) {
      if (day % 365 === 100) {
        const t = aircraftTypes.find((x) => x.id === narrow)!;
        if (s.world.cash > 3 * t.listPriceUsdM * 1e6) s = applyCommand(s, order(narrow, 1)).state;
      }
      s = stepDay(s);
      expect(s.credit?.distressSinceDay ?? null).toBeNull();
    }
    expect(isBankrupt(s)).toBe(false);
    expect(s.world.cash).toBeGreaterThan(0);
  }, 240_000);
});
