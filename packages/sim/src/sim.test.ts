import { describe, expect, it } from "vitest";
import { makeRng, newWorld, stepDay } from "./index";

describe("determinism", () => {
  it("same seed gives same sequence", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("stepDay advances one day without mutating", () => {
    const w = newWorld(1);
    const next = stepDay(w);
    expect(next.day).toBe(1);
    expect(w.day).toBe(0);
  });
});
