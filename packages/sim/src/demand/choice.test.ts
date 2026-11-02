import { describe, expect, it } from "vitest";
import { HNL, LAX, OGG, SAN, SFO } from "../testing/fixtures";
import { directItinerary, viaItinerary } from "../testing/builders";
import { distanceKm } from "../geo";
import { marketOnDay, SEGMENTS } from "./market";
import { benchmarkFare, runChoice, scheduleFit, type OutsideContext } from "./choice";

const DAY = 195; // mid-July 2015
const laxHnlFull = marketOnDay(LAX, HNL, DAY);
/** Scaled-down market so unconstrained-share tests need no huge fleets. */
const scale = (d: Record<string, number>, k: number) =>
  Object.fromEntries(Object.entries(d).map(([s, v]) => [s, v * k])) as typeof laxHnlFull.bySegment;
const laxHnl = { ...laxHnlFull, bySegment: scale(laxHnlFull.bySegment, 0.05) };
const BIG = 100_000; // seats per departure: capacity never binds
const laxHnlCtx: OutsideContext = { distanceKm: distanceKm(LAX, HNL), driveAvailable: false };

describe("choice: frequency (worked example b)", () => {
  const share = (f: number) => {
    const r = runChoice({
      demand: laxHnl.bySegment,
      outside: laxHnlCtx,
      // rival is fixed at 14/wk, big enough that nothing spills
      itineraries: [
        directItinerary("P", LAX, HNL, f, BIG, 270),
        directItinerary("R", LAX, HNL, 14, BIG, 270),
      ],
    });
    return r.itineraries[0]!.passengers;
  };

  it("raises share superlinearly at low frequency, then saturates", () => {
    const s1 = share(1), s2 = share(2), s4 = share(4), s8 = share(8), s16 = share(16), s32 = share(32), s64 = share(64);
    console.log("freq share", { s1, s2, s4, s8, s16, s32, s64 });
    // doubling from a low base more than doubles passengers (superlinear)
    expect(s2 / s1).toBeGreaterThan(2);
    expect(s4 / s2).toBeGreaterThan(2);
    // marginal returns then shrink: later doublings give less than the earlier ones and approach 1
    expect(s8 / s4).toBeLessThan(s4 / s2);
    expect(s16 / s8).toBeLessThan(s8 / s4);
    expect(s32 / s16).toBeLessThan(1.25);
    expect(s64 / s32).toBeLessThan(1.05);
  });

  it("S-curve is bounded", () => {
    expect(scheduleFit(0, 6, 2.5)).toBe(0);
    expect(scheduleFit(6, 6, 2.5)).toBeCloseTo(0.5, 9);
    expect(scheduleFit(1000, 6, 2.5)).toBeGreaterThan(0.999);
  });
});

describe("choice: connecting vs direct (worked example c)", () => {
  const run = (viaFare: number) => {
    const direct = directItinerary("D", LAX, HNL, 14, BIG, 270);
    const via = viaItinerary("V", LAX, SFO, HNL, 14, BIG, viaFare);
    const r = runChoice({ demand: laxHnl.bySegment, outside: laxHnlCtx, itineraries: [direct, via] });
    return { d: r.itineraries[0]!.passengers, v: r.itineraries[1]!.passengers };
  };
  it("loses to a direct flight at equal fare", () => {
    const r = run(270);
    console.log("equal fare direct vs via", r);
    expect(r.v).toBeLessThan(r.d * 0.25);
  });
  it("captures share when materially cheaper", () => {
    const r = run(270 * 0.55);
    console.log("cheap via", r);
    expect(r.v).toBeGreaterThan(r.d);
  });
  it("benchmark fares are plausible", () => {
    expect(benchmarkFare(distanceKm(LAX, SFO))).toBeGreaterThan(90);
    expect(benchmarkFare(distanceKm(LAX, SFO))).toBeLessThan(125);
    expect(benchmarkFare(distanceKm(LAX, HNL))).toBeGreaterThan(250);
    expect(benchmarkFare(distanceKm(LAX, HNL))).toBeLessThan(300);
  });
});

describe("choice: spill and recapture (worked example d)", () => {
  const tight = () =>
    runChoice({
      demand: laxHnl.bySegment,
      outside: laxHnlCtx,
      itineraries: [
        directItinerary("A", LAX, HNL, 7, 50, 300), // 350 seats, cheap and attractive -> spills
        directItinerary("B", LAX, HNL, 7, 60, 360),
        viaItinerary("C", LAX, SFO, HNL, 7, 50, 280),
      ],
    });
  it("conserves total demand across captured, outside and lost buckets", () => {
    const r = tight();
    const t = r.totals;
    const sum = t.captured + t.lostToOutside + t.lostNotRecaptured + t.lostNoSeats + t.unservedSpill;
    console.log("conservation", t, sum);
    expect(Math.abs(sum - t.demand)).toBeLessThan(t.demand * 1e-9);
    expect(t.captured).toBeGreaterThan(0);
  });
  it("respects leg capacity and recaptures some spill", () => {
    const r = tight();
    for (const leg of Object.values(r.legs)) expect(leg.load).toBeLessThanOrEqual(leg.capacity + 1e-6);
    const spilled = r.itineraries.reduce((s, i) => s + i.spilled, 0);
    const recaptured = r.itineraries.reduce((s, i) => s + i.recaptured, 0);
    expect(spilled).toBeGreaterThan(0);
    expect(recaptured).toBeGreaterThan(0);
    expect(recaptured).toBeLessThan(spilled);
  });
  it("with ample capacity nothing spills", () => {
    const r = runChoice({
      demand: laxHnl.bySegment,
      outside: laxHnlCtx,
      itineraries: [directItinerary("A", LAX, HNL, 70, BIG, 270)],
    });
    expect(r.itineraries[0]!.spilled).toBe(0);
    expect(r.totals.unservedSpill).toBe(0);
  });
  it("a full competitor pushes passengers to the remaining option", () => {
    const base = runChoice({
      demand: laxHnl.bySegment,
      outside: laxHnlCtx,
      itineraries: [directItinerary("A", LAX, HNL, 7, 100, 270), directItinerary("B", LAX, HNL, 14, BIG, 270)],
    });
    const squeezed = runChoice({
      demand: laxHnl.bySegment,
      outside: laxHnlCtx,
      itineraries: [directItinerary("A", LAX, HNL, 7, 100, 270), directItinerary("B", LAX, HNL, 14, 20, 270)],
    });
    expect(squeezed.itineraries[0]!.passengers).toBeGreaterThanOrEqual(base.itineraries[0]!.passengers);
    expect(squeezed.itineraries[0]!.passengers).toBeLessThanOrEqual(700 + 1e-6);
  });
});

describe("choice: outside option", () => {
  it("driving absorbs most of a very short pair, little of a long one", () => {
    const m = marketOnDay(LAX, SAN, DAY);
    const r = runChoice({
      demand: m.bySegment,
      outside: { distanceKm: distanceKm(LAX, SAN), driveAvailable: true },
      itineraries: [directItinerary("A", LAX, SAN, 70, BIG, benchmarkFare(distanceKm(LAX, SAN)))],
    });
    expect(r.totals.lostToOutside / r.totals.demand).toBeGreaterThan(0.5);
    const long = runChoice({
      demand: laxHnl.bySegment,
      outside: laxHnlCtx,
      itineraries: [directItinerary("A", LAX, HNL, 70, BIG, benchmarkFare(distanceKm(LAX, HNL)))],
    });
    expect(long.totals.lostToOutside / long.totals.demand).toBeLessThan(0.15);
  });
  it("higher fares reduce total captured demand", () => {
    const at = (fare: number) =>
      runChoice({
        demand: laxHnl.bySegment,
        outside: laxHnlCtx,
        itineraries: [directItinerary("A", LAX, HNL, 70, BIG, fare)],
      }).totals.captured;
    expect(at(500)).toBeLessThan(at(270));
    expect(at(270)).toBeLessThan(at(160));
  });
  it("short inter-island pair works with fixtures", () => {
    const m = marketOnDay(HNL, OGG, DAY);
    expect(SEGMENTS.reduce((s, g) => s + m.bySegment[g], 0)).toBeCloseTo(m.weekly, 6);
  });
});
