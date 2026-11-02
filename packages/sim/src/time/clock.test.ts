import { describe, expect, it } from "vitest";
import { createClock, DAYS_PER_SECOND, type AutoSlowHook } from "./clock";

describe("clock", () => {
  it("paused clock never advances", () => {
    const c = createClock();
    expect(c.advance(5000)).toBe(0);
    expect(c.day).toBe(0);
  });

  it("speed table matches the spec", () => {
    expect(DAYS_PER_SECOND).toEqual({ 0: 0, 1: 0.5, 2: 1, 3: 3, 4: 7, 5: 30 });
  });

  it("speed 1 gives one day per two seconds, accumulating across frames", () => {
    const c = createClock({ speed: 1 });
    let days = 0;
    for (let i = 0; i < 100; i++) days += c.advance(20); // 2 s in 20 ms frames
    expect(days).toBe(1);
    expect(c.day).toBe(1);
  });

  it("is frame-rate independent over a long run", () => {
    const run = (dt: number) => {
      const c = createClock({ speed: 3, maxDtMs: 1e9 });
      let days = 0;
      for (let t = 0; t < 10_000; t += dt) days += c.advance(dt);
      return days;
    };
    expect(run(16)).toBeGreaterThanOrEqual(29);
    expect(run(16)).toBeLessThanOrEqual(30);
    expect(run(250)).toBe(30);
  });

  it("clamps huge frame gaps", () => {
    const c = createClock({ speed: 5 });
    expect(c.advance(60_000)).toBe(30); // clamped to 1 s
  });

  it("is deterministic", () => {
    const r = () => {
      const c = createClock({ speed: 4 });
      const out: number[] = [];
      for (const dt of [16, 17, 33, 250, 5, 999]) out.push(c.advance(dt));
      return out;
    };
    expect(r()).toEqual(r());
  });

  it("auto-slow hook interrupts the batch and lowers speed", () => {
    const hook: AutoSlowHook = {
      check: (day) => (day === 10 ? { maxSpeed: 1, reason: "aircraft delivery" } : null),
    };
    const c = createClock({ speed: 5, hook, startDay: 7 });
    expect(c.advance(1000)).toBe(3); // days 8, 9, 10 then stop
    expect(c.day).toBe(10);
    expect(c.speed).toBe(1);
    expect(c.lastAutoSlow?.reason).toBe("aircraft delivery");
    expect(c.accumulator).toBe(0);
    c.setSpeed(2);
    expect(c.lastAutoSlow).toBeNull();
  });

  it("auto-slow can pause", () => {
    const c = createClock({ speed: 3, hook: { check: () => ({ maxSpeed: 0, reason: "bankrupt" }) } });
    expect(c.advance(1000)).toBe(1);
    expect(c.speed).toBe(0);
    expect(c.advance(1000)).toBe(0);
  });
});
