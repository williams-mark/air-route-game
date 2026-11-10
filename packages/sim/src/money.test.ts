import { describe, expect, it } from "vitest";
import { usdK, usdM } from "./money";

describe("money formatting for messages", () => {
  it("puts the minus sign before the dollar sign", () => {
    expect(usdM(19_500_000)).toBe("$19.5M");
    expect(usdM(-167_500_000)).toBe("-$167.5M");
    expect(usdM(-20_000)).toBe("$0.0M");
    expect(usdK(450_000)).toBe("$450k");
    expect(usdK(-1_234_000)).toBe("-$1234k");
  });
});
