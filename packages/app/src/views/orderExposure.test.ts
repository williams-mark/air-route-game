import { describe, expect, it } from "vitest";
import { FINANCING_PARAMS } from "@arg/sim";
import { parseQuantity, pendingBalanceUsd } from "./orderExposure";

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
