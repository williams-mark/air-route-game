import { describe, expect, it } from "vitest";
import { AIRPORTS, HNL, LAX, OGG, SAN, SFO } from "../testing/fixtures";
import { baseWeeklyDemand, marketOnDay, pairMarket, SEGMENTS, seasonality, segmentShares } from "./market";

describe("market calibration", () => {
  it("prints and bounds the calibration targets", () => {
    const sfo = baseWeeklyDemand(LAX, SFO);
    const hnl = baseWeeklyDemand(LAX, HNL);
    console.log(`CALIBRATION LAX-SFO ${Math.round(sfo)}/wk one-way, LAX-HNL ${Math.round(hnl)}/wk one-way`);
    for (let i = 0; i < AIRPORTS.length; i++)
      for (let j = i + 1; j < AIRPORTS.length; j++) {
        const m = pairMarket(AIRPORTS[i]!, AIRPORTS[j]!);
        console.log(`  ${m.origin}-${m.destination} ${Math.round(m.distanceKm)} km ${Math.round(m.baseWeekly)}/wk`);
      }
    expect(sfo).toBeGreaterThan(60_000);
    expect(sfo).toBeLessThan(90_000);
    expect(hnl).toBeGreaterThan(25_000);
    expect(hnl).toBeLessThan(40_000);
  });

  it("small pairs are much smaller than the big ones", () => {
    const small = baseWeeklyDemand(SAN, OGG);
    expect(small).toBeLessThan(baseWeeklyDemand(LAX, HNL) / 3);
    expect(small).toBeLessThan(baseWeeklyDemand(LAX, SFO) / 8);
  });

  it("is symmetric and positive", () => {
    expect(baseWeeklyDemand(LAX, SFO)).toBeCloseTo(baseWeeklyDemand(SFO, LAX), 9);
    for (const a of AIRPORTS) for (const b of AIRPORTS) if (a !== b) expect(baseWeeklyDemand(a, b)).toBeGreaterThan(0);
  });

  it("distance decays demand for equal-size pairs; population grows it", () => {
    expect(baseWeeklyDemand(SFO, SAN)).toBeGreaterThan(0);
    expect(baseWeeklyDemand(LAX, OGG)).toBeLessThan(baseWeeklyDemand(LAX, HNL));
  });
});

describe("segments", () => {
  it("shares sum to 1; business is bigger on LAX-SFO, leisure on LAX-HNL", () => {
    const a = segmentShares(LAX, SFO);
    const b = segmentShares(LAX, HNL);
    expect(SEGMENTS.reduce((s, g) => s + a[g], 0)).toBeCloseTo(1, 9);
    expect(SEGMENTS.reduce((s, g) => s + b[g], 0)).toBeCloseTo(1, 9);
    expect(a.business).toBeGreaterThan(b.business * 2);
    expect(b.leisure).toBeGreaterThan(a.leisure);
    expect(b.leisure).toBeGreaterThan(0.5);
  });
});

describe("seasonality", () => {
  const JUL15 = 195, SEP25 = 267, DEC20 = 353, FEB10 = 40;
  it("Hawaii peaks in summer and December and troughs in autumn", () => {
    const jul = marketOnDay(LAX, HNL, JUL15).weekly;
    const dec = marketOnDay(LAX, HNL, DEC20).weekly;
    const sep = marketOnDay(LAX, HNL, SEP25).weekly;
    const feb = marketOnDay(LAX, HNL, FEB10).weekly;
    expect(jul).toBeGreaterThan(sep * 1.3);
    expect(dec).toBeGreaterThan(sep * 1.3);
    expect(jul).toBeGreaterThan(feb);
  });
  it("is smooth day to day and averages to ~1 over a year", () => {
    let prev = seasonality(0, "leisure", LAX, HNL);
    let sum = 0;
    for (let d = 0; d < 365; d++) {
      const v = seasonality(d, "leisure", LAX, HNL);
      expect(Math.abs(v - prev)).toBeLessThan(0.03);
      prev = v;
      sum += v;
    }
    expect(sum / 365).toBeGreaterThan(0.97);
    expect(sum / 365).toBeLessThan(1.03);
  });
  it("business dips in summer on a mainland pair", () => {
    expect(seasonality(JUL15, "business", LAX, SFO)).toBeLessThan(seasonality(FEB10, "business", LAX, SFO));
  });
});
