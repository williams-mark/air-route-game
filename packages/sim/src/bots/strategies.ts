import type { Command, Route } from "@arg/contracts";
import { benchmarkFareFor } from "../demand/fares";
import { startingFare } from "../scenario";
import { defaultLayout } from "../fleet/layout";
import { typeCanServe } from "../fleet/scheduler";
import { distanceKm } from "../geo";
import { dayToDate } from "../time/calendar";
import type { SimState } from "../state";

/** A bot decides once per decision step (monthly) and returns commands; it may only use the state and its own RNG stream. */
export interface Strategy {
  name: string;
  decide(state: SimState, rng: () => number): Command[];
}

const pick = <T,>(rng: () => number, xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!;
const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

function ownedTypeIds(state: SimState): string[] {
  return [...new Set(state.world.fleet.filter((a) => a.status !== "stored").map((a) => a.typeId))].sort();
}

/** A random feasible (origin, destination, owned type) triple, or null after a few tries. */
function randomFeasible(state: SimState, rng: () => number, hubBias = 0.6) {
  const aps = state.airports;
  const owned = ownedTypeIds(state);
  if (owned.length === 0) return null;
  const hubs = aps.filter((a) => a.slotsPerHour >= 40);
  for (let i = 0; i < 12; i++) {
    const a = rng() < hubBias ? pick(rng, hubs) : pick(rng, aps);
    const b = rng() < hubBias ? pick(rng, hubs) : pick(rng, aps);
    if (a.id === b.id) continue;
    if (state.world.routes.some((r) => (r.origin === a.id && r.destination === b.id) || (r.origin === b.id && r.destination === a.id))) continue;
    const types = owned.map((id) => state.aircraftTypes.find((t) => t.id === id)!).filter((t) => typeCanServe(a, b, t));
    if (types.length === 0) continue;
    return { a, b, type: pick(rng, types), dist: distanceKm(a, b) };
  }
  return null;
}

function randomOrder(state: SimState, rng: () => number, maxCount: number): Command | null {
  const year = dayToDate(state.world.day).year;
  const types = state.aircraftTypes.filter((t) => (t.endYear === null || t.endYear >= year) && t.introYear <= year + 3);
  if (types.length === 0) return null;
  const t = pick(rng, types);
  return { kind: "orderAircraft", typeId: t.id, count: 1 + Math.floor(rng() * maxCount), layout: defaultLayout(t) };
}

const faresFor = (typeWide: boolean, y: number, jMult: number) => (typeWide ? { Y: y, J: Math.round(y * jMult) } : { Y: y });

/** Does nothing: the baseline of the starting airline running on autopilot. */
export const passive: Strategy = { name: "passive", decide: () => [] };

/**
 * Random: opens random feasible routes at random frequencies and fares around the benchmark, nudges and closes
 * routes at random and occasionally orders random aircraft when cash allows.
 */
export const randomPlayer: Strategy = {
  name: "random",
  decide(state, rng) {
    const cmds: Command[] = [];
    if (rng() < 0.5) {
      const f = randomFeasible(state, rng);
      if (f) {
        const y = Math.round(startingFare(f.a, f.b) * range(rng, 0.75, 1.3));
        cmds.push({ kind: "openRoute", route: { origin: f.a.id, destination: f.b.id, weeklyFrequency: 2 + Math.floor(rng() * 20), fares: faresFor(f.type.widebody, y, range(rng, 2, 4)), typeId: f.type.id } });
      }
    }
    const routes = state.world.routes;
    if (routes.length > 0 && rng() < 0.5) {
      const r = pick(rng, routes);
      const d = distanceKm(state.airports.find((x) => x.id === r.origin)!, state.airports.find((x) => x.id === r.destination)!);
      cmds.push({ kind: "updateRoute", id: r.id, patch: { weeklyFrequency: Math.max(1, Math.round(r.weeklyFrequency * range(rng, 0.6, 1.5))), fares: { ...r.fares, Y: Math.max(20, Math.round(benchmarkFareFor(state.airports.find((x) => x.id === r.origin)!, state.airports.find((x) => x.id === r.destination)!, d) * range(rng, 0.7, 1.4))) } } });
    }
    if (routes.length > 3 && rng() < 0.1) cmds.push({ kind: "closeRoute", id: pick(rng, routes).id });
    if (rng() < 0.12 && state.world.cash > 60e6) {
      const o = randomOrder(state, rng, 3);
      if (o) cmds.push(o);
    }
    return cmds;
  },
};

/**
 * Greedy: opens the best-looking candidate routes by last-known economics of similar routes (here: a plain heuristic
 * on distance and hub size), tunes fares toward 78% load factor, adds frequency where full, and closes losers.
 */
export const greedy: Strategy = {
  name: "greedy",
  decide(state, rng) {
    const cmds: Command[] = [];
    for (const r of state.world.routes) {
      const rep = state.routeReports[r.id];
      if (!rep || !rep.evaluation.feasible) continue;
      const lf = rep.evaluation.loadFactor;
      const sched = rep.scheduling;
      if (rep.evaluation.profit < -20_000 && lf < 0.45 && state.world.routes.length > 4) {
        cmds.push({ kind: "closeRoute", id: r.id });
        continue;
      }
      let freq = r.weeklyFrequency;
      let y = r.fares.Y;
      if (lf > 0.88) { y = Math.round(y * 1.05); if (lf > 0.93 && (!sched || sched.underSupplied === 0)) freq = Math.min(70, freq + Math.max(1, Math.round(freq * 0.1))); }
      else if (lf < 0.6) { y = Math.round(y * 0.96); if (lf < 0.5) freq = Math.max(2, freq - 1); }
      if (freq !== r.weeklyFrequency || y !== r.fares.Y) cmds.push({ kind: "updateRoute", id: r.id, patch: { weeklyFrequency: freq, fares: { ...r.fares, Y: y } } });
    }
    // Expansion: try a few candidates, take the one with the biggest metro product per km.
    if (state.world.routes.length < 14 && rng() < 0.6) {
      let best: { a: string; b: string; t: string; w: number; y: number; wide: boolean } | null = null;
      for (let i = 0; i < 6; i++) {
        const f = randomFeasible(state, rng, 0.8);
        if (!f) continue;
        const w = Math.sqrt(f.a.metroPopulation * f.b.metroPopulation) / Math.max(300, f.dist);
        if (!best || w > best.w) best = { a: f.a.id, b: f.b.id, t: f.type.id, w, y: Math.round(startingFare(f.a, f.b)), wide: f.type.widebody };
      }
      if (best) cmds.push({ kind: "openRoute", route: { origin: best.a, destination: best.b, weeklyFrequency: 7, fares: faresFor(best.wide, best.y, 3), typeId: best.t } });
    }
    // Fleet: order when routes are short of aircraft and cash is comfortable.
    const short = Object.values(state.routeReports).some((r) => (r.scheduling?.underSupplied ?? 0) > 0);
    const inDelivery = state.world.fleet.some((a) => a.status === "delivery");
    if (short && !inDelivery && state.world.cash > 90e6) {
      const used = [...new Set(state.world.routes.map((r) => r.typeId))];
      const t = state.aircraftTypes.find((x) => x.id === pick(rng, used));
      if (t) cmds.push({ kind: "orderAircraft", typeId: t.id, count: 1, layout: defaultLayout(t) });
    }
    return cmds;
  },
};

/** Expansionist: huge random orders and many routes at extreme fares; stresses cash, scheduler and numeric ranges. */
export const yolo: Strategy = {
  name: "yolo",
  decide(state, rng) {
    const cmds: Command[] = [];
    if (rng() < 0.4) { const o = randomOrder(state, rng, 12); if (o) cmds.push(o); }
    for (let i = 0; i < 2; i++) {
      const f = randomFeasible(state, rng, 0.3);
      if (!f) continue;
      const y = Math.max(10, Math.round(startingFare(f.a, f.b) * range(rng, 0.3, 3)));
      cmds.push({ kind: "openRoute", route: { origin: f.a.id, destination: f.b.id, weeklyFrequency: 1 + Math.floor(rng() * 70), fares: faresFor(f.type.widebody, y, range(rng, 1, 8)), typeId: f.type.id } });
    }
    if (state.world.routes.length > 25) for (let i = 0; i < 3; i++) cmds.push({ kind: "closeRoute", id: pick(rng, state.world.routes).id });
    return cmds;
  },
};

/** Fare probe: random extreme premium and economy fares on every route (infinite-money-from-fares detector). */
export const fareProbe: Strategy = {
  name: "fareProbe",
  decide(state, rng) {
    const cmds: Command[] = [];
    for (const r of state.world.routes) {
      const a = state.airports.find((x) => x.id === r.origin)!;
      const b = state.airports.find((x) => x.id === r.destination)!;
      const t = state.aircraftTypes.find((x) => x.id === r.typeId)!;
      const y = Math.max(5, Math.round(benchmarkFareFor(a, b) * range(rng, 0.5, 3)));
      const fares: Route["fares"] = { Y: y, J: Math.round(y * range(rng, 1, 400)) };
      if (t.widebody) { fares.W = Math.round(y * range(rng, 1, 200)); fares.F = Math.round(y * range(rng, 1, 600)); }
      cmds.push({ kind: "updateRoute", id: r.id, patch: { fares } });
    }
    return cmds;
  },
};

/** Order churn: repeatedly orders aircraft and opens/closes routes (tests that ordering or route churn never makes money). */
export const orderChurn: Strategy = {
  name: "orderChurn",
  decide(state, rng) {
    const cmds: Command[] = [];
    const o = randomOrder(state, rng, 4);
    if (o && rng() < 0.6) cmds.push(o);
    const f = randomFeasible(state, rng, 0.5);
    if (f) cmds.push({ kind: "openRoute", route: { origin: f.a.id, destination: f.b.id, weeklyFrequency: 4, fares: faresFor(f.type.widebody, Math.round(startingFare(f.a, f.b)), 3), typeId: f.type.id } });
    for (const r of state.world.routes.slice(4)) if (rng() < 0.7) cmds.push({ kind: "closeRoute", id: r.id });
    return cmds;
  },
};

export const STRATEGIES: readonly Strategy[] = [passive, randomPlayer, greedy, yolo, fareProbe, orderChurn];
