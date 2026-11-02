import type { Aircraft, AircraftType, Airport, Route } from "@arg/contracts";
import { benchmarkFare } from "./demand/choice";
import { defaultLayout } from "./fleet/layout";
import { distanceKm } from "./geo";
import { makeRng, mixSeed } from "./rng";
import { newSim, type StartOptions } from "./index";
import type { SimState } from "./state";

/** Placeholder airline for the 2015 campaign. */
export const STARTING_AIRLINE = "Skybridge Pacific";
export const STARTING_CASH_USD = 150_000_000;

/** Starting fleet by type id (ids from @arg/data). */
export const STARTING_FLEET: ReadonlyArray<readonly [typeId: string, count: number]> = [
  ["B737-800", 6],
  ["A320", 2],
  ["B757-200", 2],
  ["B767-300ER", 1],
  ["B777-200ER", 2],
];

/** Starting routes: origin, destination, weekly round trips, requested type. */
export const STARTING_ROUTES: ReadonlyArray<readonly [string, string, number, string]> = [
  ["LAX", "SFO", 42, "B737-800"],
  ["LAX", "SAN", 14, "A320"],
  ["LAX", "HNL", 14, "B777-200ER"],
  ["LAX", "OGG", 7, "B757-200"],
];

/**
 * The 2015 starting position: Skybridge Pacific based at LAX with 13 aircraft, four routes and USD 150M.
 * Every aircraft has a plausible age and staggered check history (seeded). Types are looked up by id, so the
 * function throws if the supplied aircraft data lacks one of the starting types or airports.
 */
export function startingScenario(airports: Airport[], aircraftTypes: AircraftType[], seed = 2015): SimState {
  const rng = makeRng(mixSeed(seed, 0xf1ee7));
  const typeById = new Map(aircraftTypes.map((t) => [t.id, t]));
  const apById = new Map(airports.map((a) => [a.id, a]));
  const fleet: Aircraft[] = [];
  let n = 0;
  for (const [typeId, count] of STARTING_FLEET) {
    const type = typeById.get(typeId);
    if (!type) throw new Error(`startingScenario: aircraft type ${typeId} not in data`);
    for (let i = 0; i < count; i++) {
      n++;
      const ageYears = 2 + rng() * 12;
      fleet.push({
        id: `ac-${n}`,
        typeId,
        tailNumber: `N${String(n).padStart(3, "0")}SP`,
        layout: defaultLayout(type),
        status: "active",
        ageDays: Math.round(ageYears * 365),
        hoursSinceCheck: { A: Math.round(rng() * 450), B: 0, C: 0, D: 0 },
      });
    }
  }
  const routes: Route[] = STARTING_ROUTES.map(([o, d, freq, typeId], i) => {
    const a = apById.get(o);
    const b = apById.get(d);
    if (!a || !b) throw new Error(`startingScenario: airport ${o} or ${d} not in data`);
    const y = Math.round(benchmarkFare(distanceKm(a, b)));
    const wide = typeById.get(typeId)!.widebody;
    return {
      id: `route-${i + 1}`,
      origin: o,
      destination: d,
      weeklyFrequency: freq,
      fares: wide ? { Y: y, J: Math.round(y * 3.2) } : { Y: y },
      typeId,
    };
  });
  const opts: StartOptions = { cash: STARTING_CASH_USD, fleet, routes, airlineName: STARTING_AIRLINE, baseAirport: "LAX" };
  return newSim(seed, airports, aircraftTypes, { notionalFleet: false }, opts);
}
