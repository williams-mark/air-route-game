import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "../scenario";
import { applyCommand, runDays, stepDay } from "../index";
import { absorbRival, guidePriceUsd, marketOf, playerValuation, reservationPriceUsd, respondToBid, rivalValuation, stepMarket } from "./market";
import { rampedIntensity, DIFFICULTY, RAMP } from "../rivals/config";
import { jan1Day } from "../time/calendar";
import type { SimState } from "../state";

const types = new Map(aircraftTypes.map((t) => [t.id, t]));
const world = (seed = 5) => startingScenario(airports, aircraftTypes, seed, { rivalField: "world" });

describe("valuation", () => {
  it("values the player and every competitor; month starts record history", () => {
    let s = world();
    const v = playerValuation(s);
    expect(v.valueUsd).toBeGreaterThan(0);
    expect(v.cashUsd).toBe(s.world.cash);
    for (const a of s.rivals!.airlines) expect(rivalValuation(a, types).valueUsd).toBeGreaterThan(0);
    s = runDays(s, 62);
    const m = marketOf(s);
    expect(m.history.length).toBeGreaterThanOrEqual(2);
    expect(m.history[0]!.rivals.length).toBe(s.rivals!.airlines.filter((a) => a.status === "active").length);
  }, 60_000);
});

describe("buying a competitor", () => {
  const smallest = (s: SimState) => [...s.rivals!.airlines].filter((a) => a.status === "active").sort((x, y) => rivalValuation(x, types).valueUsd - rivalValuation(y, types).valueUsd)[0]!;

  it("a low offer is rejected with a hint and a cool-down; one at the asking price buys the airline", () => {
    const s0 = runDays(world(), 7);
    const target = smallest(s0);
    const ask = reservationPriceUsd(s0, target);
    const low = applyCommand(s0, { kind: "bidForAirline", airlineId: target.id, priceUsd: ask * 0.7 });
    expect(low.result.ok).toBe(false);
    expect(low.result.ok ? "" : low.result.message).toMatch(/rejected/);
    expect(marketOf(low.state).bids.at(-1)!.outcome).toBe("rejected");
    // Cool-down: even a good offer is refused until it ends.
    const again = applyCommand(low.state, { kind: "bidForAirline", airlineId: target.id, priceUsd: ask * 2 });
    expect(again.result.ok).toBe(false);

    const fleetBefore = s0.world.fleet.length, routesBefore = s0.world.routes.length;
    const buy = applyCommand({ ...s0, world: { ...s0.world, cash: s0.world.cash + 2 * ask } }, { kind: "bidForAirline", airlineId: target.id, priceUsd: Math.ceil(ask) });
    expect(buy.result.ok).toBe(true);
    const s1 = buy.state;
    expect(s1.rivals!.airlines.find((a) => a.id === target.id)!.status).toBe("acquired");
    expect(s1.world.fleet.length).toBe(fleetBefore + target.fleet.length);
    expect(s1.world.routes.length).toBeGreaterThan(routesBefore);
    expect(s1.world.ownedHubs).toContain(target.bases[0]);
    // The merged airline keeps flying: a few days later the new routes have reports and cash is finite.
    const s2 = runDays(s1, 3);
    expect(Number.isFinite(s2.world.cash)).toBe(true);
    expect(s2.world.routes.filter((r) => s2.routeReports[r.id]).length).toBe(s2.world.routes.length);
    expect(guidePriceUsd(s0, target)).toBeGreaterThan(0);
  }, 120_000);

  it("refuses an offer the credit line cannot cover", () => {
    const s0 = runDays(world(), 7);
    const r = applyCommand(s0, { kind: "bidForAirline", airlineId: smallest(s0).id, priceUsd: 1e12 });
    expect(r.result.ok).toBe(false);
    expect(r.result.ok ? "" : r.result.message).toMatch(/credit line/);
  }, 60_000);
});

describe("offers for the player's airline", () => {
  const withOffer = (s: SimState): SimState => {
    const big = [...s.rivals!.airlines].sort((x, y) => rivalValuation(y, types).valueUsd - rivalValuation(x, types).valueUsd)[0]!;
    const m = marketOf(s);
    return { ...s, market: { ...m, incoming: [{ id: "bid-1", rivalId: big.id, rivalName: big.name, day: s.world.day, expiresDay: s.world.day + 30, priceUsd: 5e8, valueUsd: 4e8 }], nextBid: 2 } };
  };

  it("accepting merges the bidder into the player, who runs it under the bidder's name; the price is a payout", () => {
    const s = withOffer(runDays(world(), 7));
    const bid = marketOf(s).incoming[0]!;
    const bidder = s.rivals!.airlines.find((a) => a.id === bid.rivalId)!;
    const r = respondToBid(s, "bid-1", true);
    expect(r.ok).toBe(true);
    expect(r.state.airlineName).toBe(bidder.name);
    expect(r.state.world.fleet.length).toBe(s.world.fleet.length + bidder.fleet.length);
    expect(marketOf(r.state).payoutUsd).toBe(5e8);
    expect(marketOf(r.state).incoming).toEqual([]);
  }, 60_000);

  it("declining makes the bidder hostile for a year", () => {
    const s = withOffer(runDays(world(), 7));
    const r = respondToBid(s, "bid-1", false);
    const id = marketOf(s).incoming[0]!.rivalId;
    expect(marketOf(r.state).hostileUntil[id]).toBe(s.world.day + 365);
    expect(r.state.world.fleet.length).toBe(s.world.fleet.length);
  }, 60_000);

  it("offers lapse after their expiry", () => {
    const s = withOffer(runDays(world(), 7));
    const lapsed = stepMarket({ ...s, world: { ...s.world, day: s.world.day + 31 } });
    expect(marketOf(lapsed).incoming).toEqual([]);
  }, 60_000);

  it("absorbing keeps every aircraft id unique and routes valid", () => {
    const s = runDays(world(), 7);
    const out = absorbRival(s, s.rivals!.airlines[0]!, 0);
    expect(new Set(out.world.fleet.map((a) => a.id)).size).toBe(out.world.fleet.length);
    for (const ac of out.world.fleet) expect(out.fleetMeta[ac.id]).toBeDefined();
    expect(new Set(out.world.routes.map((r) => r.id)).size).toBe(out.world.routes.length);
    expect(stepDay(out).world.cash).toBeTypeOf("number");
  }, 60_000);
});

describe("competitors get tougher with time", () => {
  it("the ramp raises entries, entry size and decision pace over ten years, and stops there", () => {
    const base = DIFFICULTY.medium.intensity;
    const y0 = rampedIntensity(base, 0), y5 = rampedIntensity(base, 5), y10 = rampedIntensity(base, 10), y20 = rampedIntensity(base, 20);
    expect(y0).toEqual(base);
    expect(y5.entriesPerDecision).toBeGreaterThanOrEqual(base.entriesPerDecision + 1);
    expect(y10.entriesPerDecision).toBe(base.entriesPerDecision + RAMP.extraEntries);
    expect(y10.entryShareScale).toBeCloseTo(base.entryShareScale * (1 + RAMP.entryShareGain), 9);
    expect(y10.decisionCycleWeeks).toBeLessThan(base.decisionCycleWeeks);
    expect(y20).toEqual(y10);
  });

  it("before 2015 the world field makes decisions (it used to wait for day 0)", () => {
    let s = startingScenario(airports, aircraftTypes, 7, { rivalField: "world", startYear: 1995, presentYear: 2026 });
    expect(s.world.day).toBe(jan1Day(1995));
    const routes0 = s.rivals!.airlines.reduce((t, a) => t + a.routes.length + (a.pending?.length ?? 0), 0);
    s = runDays(s, 200);
    const routes1 = s.rivals!.airlines.reduce((t, a) => t + a.routes.length + (a.pending?.length ?? 0), 0);
    const decided = s.rivals!.airlines.filter((a) => (a.lastDecisionDay ?? -Infinity) > jan1Day(1995)).length;
    expect(decided).toBeGreaterThan(10);
    expect(routes1).not.toBe(routes0);
  }, 120_000);
});
