import type { AircraftType, Airport, Route } from "@arg/contracts";
import { makeRng, mixSeed } from "../rng";
import type { SimState } from "../state";
import { pandemicFactor } from "../demand/pandemic";
import { makeContext, stepRivalsWeek } from "./engine";

export * from "./types";
export * from "./config";
export { createRivals, rivalItinerariesFor, marketKey, canServe, evaluateMarket, makeContext, weeklyFixed, scopeOf, inScope, candidatePairs, CANDIDATE_TOP_K } from "./engine";
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
    state.params.pandemic === false ? undefined : (a, b) => pandemicFactor(day, a, b),
  );
  const res = stepRivalsWeek(state.rivals, ctx, day / 7, state.world.seed);
  const next: SimState = { ...state, rivals: res.rivals, bankruptcies: [...state.bankruptcies, ...res.bankruptcies] };
  return res.notices.length > 0 ? { ...next, pendingEvents: [...next.pendingEvents, ...res.notices].slice(-next.params.eventQueueLimit) } : next;
}
