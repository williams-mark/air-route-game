import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { baseJetAPriceUsdPerGallon } from "../finance/fuel";
import { pandemicFactor, pandemicNewsOn } from "./pandemic";
import { jan1Day } from "../time/calendar";
import { runDays, startingScenario } from "../index";

const ap = (id: string) => airports.find((a) => a.id === id)!;
const day = (y: number, frac: number) => jan1Day(y) + Math.round(frac * 365);

describe("pandemic shock", () => {
  it("is 1 before March 2020 and after 2023, and deterministic", () => {
    expect(pandemicFactor(day(2019, 0.5), ap("LAX"), ap("SFO"))).toBe(1);
    expect(pandemicFactor(day(2024, 0.1), ap("LAX"), ap("SFO"))).toBe(1);
    expect(pandemicFactor(day(2020, 0.3), ap("LAX"), ap("SFO"))).toBe(pandemicFactor(day(2020, 0.3), ap("LAX"), ap("SFO")));
  });
  it("collapses in April 2020 and recovers domestic faster than international", () => {
    const apr = day(2020, 0.29);
    expect(pandemicFactor(apr, ap("LAX"), ap("SFO"))).toBeLessThan(0.1);
    expect(pandemicFactor(apr, ap("LAX"), ap("LHR"))).toBeLessThan(0.05);
    const mid21 = day(2021, 0.5);
    expect(pandemicFactor(mid21, ap("LAX"), ap("SFO"))).toBeGreaterThan(0.8);
    expect(pandemicFactor(mid21, ap("LAX"), ap("LHR"))).toBeLessThan(0.35);
    expect(pandemicFactor(day(2023, 0.2), ap("LAX"), ap("SFO"))).toBe(1);
  });
  it("can be switched off", () => {
    expect(pandemicFactor(day(2020, 0.29), ap("LAX"), ap("SFO"), false)).toBe(1);
  });
  it("posts the news on its calendar days only", () => {
    expect(pandemicNewsOn(day(2020, 0.1)).length).toBe(0);
    let n = 0;
    for (let d = jan1Day(2020); d < jan1Day(2023); d++) n += pandemicNewsOn(d).length;
    expect(n).toBe(5);
  });
  it("cuts 2020 revenue sharply, leaves a game with the shock off untouched, and does not touch a game starting in 2024", () => {
    const rev = (s: ReturnType<typeof startingScenario>, days: number) => {
      const t = runDays(s, days);
      return t.snapshots.slice(-days).reduce((a, x) => a + x.revenue, 0);
    };
    const mk = (opts = {}) => startingScenario(airports, aircraftTypes, 4, { startYear: 2019, presentYear: 2026, ...opts });
    const a = mk(), b = mk({ pandemic: false });
    const withShock = rev(a, 730), without = rev(b, 730);
    expect(withShock).toBeLessThan(0.85 * without);
    const late1 = startingScenario(airports, aircraftTypes, 4, { startYear: 2024, presentYear: 2026 });
    const late2 = startingScenario(airports, aircraftTypes, 4, { startYear: 2024, presentYear: 2026, pandemic: false });
    expect(rev(late1, 60)).toBeCloseTo(rev(late2, 60), 0);
  }, 120_000);
});

describe("fuel series", () => {
  it("annual means of the sourced years equal the FRED/EIA level plus the 0.30 premium", () => {
    const src: Record<number, number> = { 2015: 1.522, 2016: 1.252, 2017: 1.558, 2018: 2.027, 2019: 1.879, 2020: 1.099, 2021: 1.858, 2022: 3.374, 2023: 2.699, 2024: 2.338, 2025: 2.114 };
    for (const [y, v] of Object.entries(src)) {
      const y0 = jan1Day(Number(y)), n = jan1Day(Number(y) + 1) - y0;
      let sum = 0;
      for (let d = 0; d < n; d++) sum += baseJetAPriceUsdPerGallon(y0 + d);
      expect(sum / n).toBeGreaterThan(v + 0.3 - 0.12);
      expect(sum / n).toBeLessThan(v + 0.3 + 0.12);
    }
  });
  it("is defined, positive and not flat through 2040 and beyond", () => {
    const p = (y: number) => baseJetAPriceUsdPerGallon(jan1Day(y));
    expect(p(2030)).toBeGreaterThan(p(2029));
    expect(p(2040)).toBeGreaterThan(p(2030));
    expect(p(2060)).toBeGreaterThan(p(2040));
  });
});
