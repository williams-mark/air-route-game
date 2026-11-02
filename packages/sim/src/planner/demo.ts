import type { Aircraft, AircraftType, Airport } from "@arg/contracts";
import { defaultLayout } from "../fleet/layout";
import { initialMeta } from "../fleet/maintenance";
import { typeCanServe } from "../fleet/scheduler";
import { makeRng, mixSeed } from "../rng";
import { startingFare, startingScenario } from "../scenario";
import type { SimState } from "../state";

/** Extra aircraft added by the demo fleet: type id and count. */
const EXTRA_FLEET: ReadonlyArray<readonly [string, number]> = [
  ["B737-800", 9], ["B737-900ER", 3], ["A320", 3], ["A321", 2], ["A220-300", 2], ["E175", 2], ["B757-200", 1], ["A330-200", 2], ["B787-9", 2], ["B777-200ER", 1],
];
const EXTRA_ROUTES: ReadonlyArray<readonly [string, string, number, string]> = [
  ["LAX", "SJC", 28, "B737-800"], ["LAX", "SMF", 21, "A320"], ["SFO", "SAN", 21, "B737-900ER"], ["LAX", "OAK", 14, "A220-300"],
  ["SFO", "HNL", 14, "A330-200"], ["LAX", "KOA", 7, "B757-200"], ["SAN", "SFO", 14, "A321"], ["LAX", "SBA", 14, "E175"],
  ["SFO", "OGG", 7, "B787-9"], ["LAX", "LIH", 7, "B757-200"],
];

/**
 * Larger test/debug fleet (about 35 aircraft, 14 routes) built on the starting scenario. Aircraft are delivered with seeded
 * ages and staggered check clocks, so heavy checks fall across the year. For the fleet-planner tests and screenshots only.
 */
export function plannerDemoFleet(airports: Airport[], types: AircraftType[], seed = 2015): SimState {
  const base = startingScenario(airports, types, seed);
  const rng = makeRng(mixSeed(seed, 0xd3a0));
  const T = new Map(types.map((t) => [t.id, t]));
  const A = new Map(airports.map((a) => [a.id, a]));
  const fleet: Aircraft[] = [...base.world.fleet];
  const meta = { ...base.fleetMeta };
  let n = fleet.length;
  for (const [typeId, count] of EXTRA_FLEET) {
    const type = T.get(typeId);
    if (!type) continue;
    for (let i = 0; i < count; i++) {
      n++;
      const ac: Aircraft = {
        id: `ac-${n}`, typeId, tailNumber: `N${String(n).padStart(3, "0")}SP`, layout: defaultLayout(type), status: "active",
        ageDays: Math.round((1 + rng() * 10) * 365), hoursSinceCheck: { A: Math.round(rng() * 450), B: 0, C: 0, D: 0 },
      };
      fleet.push(ac);
      meta[ac.id] = initialMeta(ac, rng);
    }
  }
  let r = base.world.routes.length;
  const routes = [...base.world.routes];
  for (const [o, d, freq, typeId] of EXTRA_ROUTES) {
    const a = A.get(o), b = A.get(d), type = T.get(typeId);
    if (!a || !b || !type || !typeCanServe(a, b, type)) continue;
    r++;
    const y = startingFare(a, b);
    routes.push({ id: `route-${r}`, origin: o, destination: d, weeklyFrequency: freq, fares: type.widebody ? { Y: y, J: Math.round(y * 3.2) } : { Y: y }, typeId });
  }
  return { ...base, world: { ...base.world, fleet, routes }, fleetMeta: meta, counters: { ...base.counters, aircraft: n, route: r } };
}
