import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { CabinLayout } from "@arg/contracts";
import { applyCommand, type AnyCommand } from "../commands";
import { stepDay } from "../index";
import { makeRng } from "../rng";
import { startingScenario } from "../scenario";
import type { SimState } from "../state";
import { checkState, findNonFinite } from "./invariants";

const ERROR_CODES = new Set([
  "invalid_speed", "unknown_airport", "same_airport", "unknown_type", "invalid_frequency", "invalid_fare", "out_of_range",
  "runway_too_short", "no_suitable_aircraft", "duplicate_route", "unknown_route", "invalid_count", "invalid_layout",
  "type_unavailable", "insufficient_cash", "insufficient_block_hours", "insufficient_slots", "invalid_fare_policy", "unknown_policy", "unknown_terminal", "unknown_offer", "offer_expired", "unknown_aircraft", "aircraft_unavailable",
  "credit_limit", "unknown_order", "bankrupt", // credit line (lane/credit-bankruptcy): the fuzz can overspend into distress and bankruptcy
  "overwater_limit", "airport_closed", // reachable now that random airport pairs can be intercontinental (lane/globe-data)
]);

/** Values chosen to hit edge cases: valid, boundary, negative, fractional, huge, non-finite, wrong type. */
const WEIRD_NUMBERS = [0, -1, 1, 2, 7, 14, 140, 141, 0.5, 1e9, -1e9, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER];
const WEIRD_IDS = ["", "nope", "route-1", "ac-1", "offer-1", "__proto__", "LAX", "SAN", "???"];

function gen(rng: () => number, s: SimState) {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const num = (valid: () => number) => (rng() < 0.7 ? valid() : pick(WEIRD_NUMBERS));
  const apId = () => (rng() < 0.85 ? pick(s.airports).id : pick(WEIRD_IDS));
  const typeId = () => (rng() < 0.85 ? pick(s.aircraftTypes).id : pick(WEIRD_IDS));
  const routeId = () => (rng() < 0.7 && s.world.routes.length ? pick(s.world.routes).id : pick(WEIRD_IDS));
  const acId = () => (rng() < 0.7 && s.world.fleet.length ? pick(s.world.fleet).id : pick(WEIRD_IDS));
  const offerId = () => (rng() < 0.7 && s.offers.length ? pick(s.offers).id : pick(WEIRD_IDS));
  const fares = () => {
    const f: Record<string, number> = { Y: num(() => 40 + rng() * 400) };
    if (rng() < 0.4) f.J = num(() => 200 + rng() * 1500);
    if (rng() < 0.2) f.F = num(() => 500 + rng() * 3000);
    if (rng() < 0.2) f.W = num(() => 100 + rng() * 800);
    return f as { Y: number };
  };
  const layout = (): CabinLayout => {
    if (rng() < 0.2) return { sections: [] };
    return {
      sections: Array.from({ length: Math.floor(rng() * 4) }, () => ({
        cls: pick(["Y", "W", "J", "F"] as const), rows: num(() => 1 + Math.floor(rng() * 30)), seatsAcross: num(() => 2 + Math.floor(rng() * 8)), pitchIn: num(() => 28 + rng() * 40),
      })),
    };
  };
  const kind = pick(["openRoute", "openRoute", "updateRoute", "closeRoute", "orderAircraft", "acceptOffer", "dismissOffer", "refitAircraft", "pinAircraft", "applyCover", "setRouteTypes", "reserveAircraft", "ignoreGap"] as const);
  switch (kind) {
    case "openRoute": return { kind, route: { origin: apId(), destination: apId(), weeklyFrequency: num(() => 1 + Math.floor(rng() * 40)), fares: fares(), typeId: typeId() } } as AnyCommand;
    case "updateRoute": {
      const patch: Record<string, unknown> = {};
      if (rng() < 0.6) patch.weeklyFrequency = num(() => 1 + Math.floor(rng() * 40));
      if (rng() < 0.6) patch.fares = fares();
      if (rng() < 0.3) patch.typeId = typeId();
      if (rng() < 0.1) patch.origin = apId();
      return { kind, id: routeId(), patch } as AnyCommand;
    }
    case "closeRoute": return { kind, id: routeId() };
    case "orderAircraft": return { kind, typeId: typeId(), count: num(() => 1 + Math.floor(rng() * 12)), layout: layout() };
    case "acceptOffer": return { kind, offerId: offerId(), quantity: num(() => 1 + Math.floor(rng() * 5)) };
    case "dismissOffer": return { kind, offerId: offerId() };
    case "refitAircraft": return { kind, aircraftId: acId(), layout: layout() };
    case "pinAircraft": return { kind, aircraftId: acId(), routeId: rng() < 0.2 ? null : routeId(), ...(rng() < 0.4 ? { fromDay: num(() => s.world.day + Math.floor(rng() * 60)), toDay: num(() => s.world.day + 60 + Math.floor(rng() * 60)) } : {}) } as AnyCommand;
    case "applyCover": return { kind, aircraftId: acId(), routeId: routeId(), fromDay: num(() => s.world.day + Math.floor(rng() * 60)), toDay: num(() => s.world.day + 30 + Math.floor(rng() * 60)) } as AnyCommand;
    case "setRouteTypes": return { kind, routeId: routeId(), preferredTypeIds: Array.from({ length: Math.floor(rng() * 4) }, () => typeId()) } as AnyCommand;
    case "reserveAircraft": return { kind, aircraftId: acId(), reserve: rng() < 0.6 };
    case "ignoreGap": return { kind, gapId: rng() < 0.8 ? `${routeId()}:${Math.floor(rng() * 90)}:${Math.floor(rng() * 90)}` : (pick(WEIRD_IDS) as string), ignore: rng() < 0.7 };
  }
}

function runFuzz(seed: number, steps: number, daysBetween: number) {
  const rng = makeRng(seed * 7919 + 13);
  let s = startingScenario(airports, aircraftTypes, seed);
  const stats = { ok: 0, err: 0, codes: new Set<string>() };
  for (let i = 0; i < steps; i++) {
    const cmd = gen(rng, s);
    let out;
    try { out = applyCommand(s, cmd); } catch (e) { throw new Error(`step ${i} seed ${seed}: ${JSON.stringify(cmd)} threw ${(e as Error).stack}`); }
    const r = out.result as { ok: boolean; error?: string; message?: string };
    if (r.ok) stats.ok++;
    else {
      stats.err++;
      if (typeof r.error !== "string" || !ERROR_CODES.has(r.error)) throw new Error(`step ${i} seed ${seed}: untyped error ${JSON.stringify(r)} for ${JSON.stringify(cmd)}`);
      if (typeof r.message !== "string" || r.message.length === 0) throw new Error(`step ${i}: error without message for ${JSON.stringify(cmd)}`);
      stats.codes.add(r.error);
      if (out.state !== s && JSON.stringify(out.state.world) !== JSON.stringify(s.world)) throw new Error(`step ${i} seed ${seed}: failed command mutated world: ${JSON.stringify(cmd)}`);
    }
    s = out.state;
    const bad = findNonFinite(s, 3);
    if (bad.length) throw new Error(`step ${i} seed ${seed}: non-finite after ${JSON.stringify(cmd)}: ${bad.join(", ")}`);
    if (daysBetween > 0 && i % 5 === 4) { for (let d = 0; d < daysBetween; d++) s = stepDay(s); }
  }
  const viol = checkState(s);
  return { stats, viol };
}

describe("command fuzz", () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`seed ${seed}: 400 random commands interleaved with stepping never throw or produce NaN`, () => {
      const { stats, viol } = runFuzz(seed, 400, 20);
      expect(viol).toEqual([]);
      expect(stats.ok).toBeGreaterThan(0);
      expect(stats.err).toBeGreaterThan(0);
    }, 120_000);
  }
  it("invalid-only barrage on a fresh state leaves it unchanged", () => {
    const s = startingScenario(airports, aircraftTypes, 9);
    const before = JSON.stringify(s.world);
    for (const cmd of [
      { kind: "openRoute", route: { origin: "XXX", destination: "LAX", weeklyFrequency: 3, fares: { Y: 100 }, typeId: "A320N" } },
      { kind: "openRoute", route: { origin: "LAX", destination: "LAX", weeklyFrequency: 3, fares: { Y: 100 }, typeId: "A320N" } },
      { kind: "updateRoute", id: "nope", patch: {} },
      { kind: "closeRoute", id: "nope" },
      { kind: "orderAircraft", typeId: "A320N", count: -3, layout: { sections: [] } },
      { kind: "orderAircraft", typeId: "NOPE", count: 1, layout: { sections: [] } },
      { kind: "acceptOffer", offerId: "nope", quantity: 1 },
      { kind: "dismissOffer", offerId: "nope" },
      { kind: "refitAircraft", aircraftId: "nope", layout: { sections: [] } },
    ] as AnyCommand[]) {
      const out = applyCommand(s, cmd);
      expect((out.result as { ok: boolean }).ok).toBe(false);
      expect(JSON.stringify(out.state.world)).toBe(before);
    }
  });
});
