import type { AircraftType, Airport, Route } from "@arg/contracts";
import { makeRng, mixSeed } from "../rng";
import type { SimState } from "../state";
import { pandemicEnabled, pandemicFactor } from "../demand/pandemic";
import { makeContext, stepRivalsWeek } from "./engine";
import { intensityOf, rampedIntensity, rampProgress, RAMP } from "./config";
import { basesOf, homeHubOf } from "../fleet/hubs";

export * from "./types";
export * from "./config";
export { createRivals, rivalItinerariesFor, competitorItinerariesFor, topAirportsByDemand, worldName, marketKey, canServe, evaluateMarket, makeContext, weeklyFixed, scopeOf, inScope, candidatePairs, CANDIDATE_TOP_K } from "./engine";
export { rivalReports, rivalNews, rivalIndustry } from "./reports";

/** Called at the end of `stepDay` for the day just simulated. Acts on days divisible by 7; returns the same state otherwise. */
export function stepRivals(state: SimState, day: number): SimState {
  if (!state.rivals || day % 7 !== 0) return state;
  const airports = new Map(state.airports.map((a: Airport) => [a.id, a]));
  const types = new Map(state.aircraftTypes.map((t: AircraftType) => [t.id, t]));
  const rng = makeRng(mixSeed(state.world.seed, 0x7a15 + day));
  const ctx = makeContext(
    airports, types, day, rng, state.world.routes as Route[],
    (id) => state.routeReports[id]?.operatedFraction ?? 1,
    (r) => state.routeReports[r.id]?.evaluation.seatsPerFlight ?? 0,
    pandemicEnabled(state.params.pandemic, state.rivals?.originDay ?? 0) ? (a, b) => pandemicFactor(day, a, b) : undefined,
  );
  // Weeks since the field was founded (the game's start). Counting from day 0 (1 January 2015) left every decision week negative in
  // games that start earlier, so before 2015 the world field never made a decision.
  const origin = state.rivals.originDay ?? 0;
  const week = Math.floor((day - origin) / 7);
  const years = (day - origin) / 365.25;
  if (state.rivals.field === "world") {
    ctx.world = true;
    ctx.intensity = rampedIntensity(intensityOf(state.rivals), years);
    const t = rampProgress(years);
    ctx.aggression = RAMP.aggressionMax * t;
    ctx.extraOutstations = Math.round(RAMP.extraOutstations * t);
    ctx.playerBases = basesOf(state);
    ctx.playerHome = homeHubOf(state);
    const hostile = Object.entries(state.market?.hostileUntil ?? {}).filter(([, until]) => until > day).map(([id]) => id);
    if (hostile.length > 0) ctx.hostile = new Set(hostile);
  }
  const res = stepRivalsWeek(state.rivals, ctx, week, state.world.seed);
  // Yearly, on the field's anniversary: every world airline gets a little leaner (RAMP.overheadCutPerYear, capped).
  if (state.rivals.field === "world" && week > 0 && week % 52 === 0) {
    const base = intensityOf(state.rivals).overheadDelta;
    for (const air of res.rivals.airlines) {
      if (air.status !== "active") continue;
      air.overheadDelta = Math.max(base - RAMP.overheadCutMax, (air.overheadDelta ?? base) - RAMP.overheadCutPerYear);
    }
  }
  const next: SimState = { ...state, rivals: res.rivals, bankruptcies: [...state.bankruptcies, ...res.bankruptcies] };
  return res.notices.length > 0 ? { ...next, pendingEvents: [...next.pendingEvents, ...res.notices].slice(-next.params.eventQueueLimit) } : next;
}
