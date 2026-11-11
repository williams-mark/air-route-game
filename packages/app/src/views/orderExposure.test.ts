import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { creditLimitUsd, FINANCING_PARAMS, startingScenario } from "@arg/sim";
import { cancelTerms, needsOrderConfirm, ORDER_LOCK_MS, orderFundingQuote, orderQuoteKey, parseQuantity, pendingBalanceUsd } from "./orderExposure";

describe("pendingBalanceUsd", () => {
  it("sums the undelivered purchase balance and ignores leases and delivered aircraft", () => {
    const keep = 1 - FINANCING_PARAMS.purchaseDownFraction;
    const orders = [
      { count: 4, delivered: 1, unitPriceUsd: 100e6, financing: "purchase" as const },
      { count: 2, delivered: 0, unitPriceUsd: 50e6, financing: "lease" as const },
      { count: 3, delivered: 3, unitPriceUsd: 80e6, financing: "purchase" as const },
      { count: 1, delivered: 0, unitPriceUsd: 10e6 },
    ];
    expect(pendingBalanceUsd(orders)).toBeCloseTo(3 * 100e6 * keep, 0);
    expect(pendingBalanceUsd([])).toBe(0);
  });
});

describe("parseQuantity", () => {
  it("accepts whole numbers in range only", () => {
    expect(parseQuantity(1, 20)).toBe(1);
    expect(parseQuantity(20, 20)).toBe(20);
    for (const bad of [0, -3, 2.5, 21, NaN, Infinity]) expect(parseQuantity(bad, 20)).toBeNull();
  });
});

describe("orderFundingQuote", () => {
  const sim = startingScenario(airports, aircraftTypes, 1);
  const t = aircraftTypes.find((x) => x.id === "B737-800")!;
  const quote = (count: number) => {
    const unit = t.listPriceUsdM * 1e6 * 0.9;
    return orderFundingQuote(sim, { financing: "purchase", count, depositUsd: unit * count * FINANCING_PARAMS.purchaseDownFraction, netUnitUsd: unit, listEachUsd: t.listPriceUsdM * 1e6 });
  };

  it("agrees with the sim: a small order passes, a deposit-affordable but unfundable one is refused with the reason", () => {
    expect(quote(1).refusal).toBeNull();
    expect(quote(1).outlook.marginUsd).toBeGreaterThan(0);
    const big = quote(5); // deposit about 95M of 150M cash, balances about 380M
    expect(big.refusal).toMatch(/Not fundable/);
    expect(big.outlook.marginUsd).toBeLessThan(0);
    expect(creditLimitUsd(sim)).toBeGreaterThan(0);
  });

  it("never refuses a lease for want of a delivery balance", () => {
    const q = orderFundingQuote(sim, { financing: "lease", count: 3, depositUsd: 3 * t.listPriceUsdM * 1e6 * 0.1, netUnitUsd: 0, listEachUsd: t.listPriceUsdM * 1e6 });
    expect(q.refusal).toBeNull();
  });
});

describe("cancelTerms", () => {
  it("forfeits the deposit share of the undelivered aircraft and relieves their balances", () => {
    const keep = 1 - FINANCING_PARAMS.purchaseDownFraction;
    const t = cancelTerms({ count: 4, delivered: 1, unitPriceUsd: 100e6, financing: "purchase", depositUsd: 80e6 });
    expect(t.aircraft).toBe(3);
    expect(t.forfeitedUsd).toBeCloseTo(60e6, 0);
    expect(t.relievedUsd).toBeCloseTo(3 * 100e6 * keep, 0);
    expect(cancelTerms({ count: 2, delivered: 0, unitPriceUsd: 50e6, financing: "lease", depositUsd: 10e6 }).relievedUsd).toBe(0);
  });
});

describe("order confirm and lock", () => {
  it("confirms every purchase and any deposit over $10M, but lets small lease orders straight through", () => {
    expect(needsOrderConfirm("purchase", 1e6)).toBe(true);
    expect(needsOrderConfirm("lease", 10_000_000)).toBe(false);
    expect(needsOrderConfirm("lease", 10_000_001)).toBe(true);
    expect(needsOrderConfirm("lease", 2_552_900_000)).toBe(true);
  });

  it("keys the quote by every input that changes the order", () => {
    const base = { typeId: "A320", count: 2, financing: "purchase" as const, deliveryHubId: "LAX" };
    expect(orderQuoteKey(base)).not.toBe(orderQuoteKey({ ...base, count: 3 }));
    expect(orderQuoteKey(base)).not.toBe(orderQuoteKey({ ...base, financing: "lease" }));
    expect(orderQuoteKey(base)).not.toBe(orderQuoteKey({ ...base, deliveryHubId: "SFO" }));
    expect(orderQuoteKey(base)).toBe(orderQuoteKey({ ...base }));
    expect(ORDER_LOCK_MS).toBeGreaterThanOrEqual(1000);
  });
});
