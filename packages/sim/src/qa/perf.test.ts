import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "../scenario";
import { stepDay } from "../index";
import { baseWeeklyDemand } from "../demand/market";
import { DEFAULT_METROS, catchmentOf } from "../demand/metros";

/**
 * Guard against per-day work growing with the number of airports. Budgets are generous (about 5x the measured numbers
 * on the build machine) so a slow CI box does not flake, but a return to O(N^2) per-day work fails them.
 * Measured on the 496-airport world: about 7 ms per sim day with 15 active rivals (the 7-rival, 52-airport baseline was about 5.5).
 */
describe("performance with the whole US and Europe", () => {
  it("steps a year of days within budget", () => {
    let s = startingScenario(airports, aircraftTypes, 2015);
    for (let i = 0; i < 20; i++) s = stepDay(s); // warm the caches
    const t0 = performance.now();
    const days = 120;
    for (let i = 0; i < days; i++) s = stepDay(s);
    const msPerDay = (performance.now() - t0) / days;
    console.log(`PERF ${airports.length} airports: ${msPerDay.toFixed(2)} ms per sim day`);
    expect(msPerDay).toBeLessThan(40);
  }, 60_000);

  it("pair demand is cached: a second sweep over all pairs from a hub is much cheaper than the first", () => {
    const hub = airports.find((a) => a.id === "ATL")!;
    const sweep = () => { const t = performance.now(); let sum = 0; for (const b of airports) if (b.id !== hub.id) sum += baseWeeklyDemand(hub, b, undefined, 100); return { ms: performance.now() - t, sum }; };
    const first = sweep(), second = sweep();
    expect(second.sum).toBe(first.sum);
    expect(second.ms).toBeLessThan(first.ms);
  });

  it("metro catchments resolve without scanning the metro list per call", () => {
    expect(DEFAULT_METROS.length).toBeGreaterThan(20);
    const t = performance.now();
    for (let i = 0; i < 20; i++) for (const a of airports) catchmentOf(a.id, a.metroPopulation, DEFAULT_METROS, 100);
    expect((performance.now() - t) / 20).toBeLessThan(50);
  });
});
