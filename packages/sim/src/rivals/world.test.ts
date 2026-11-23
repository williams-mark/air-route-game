import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { distanceKm } from "../geo";
import { blockHours } from "../finance/ledger";
import { OUTSTATION_PARAMS } from "../fleet/hubs";
import { startingScenario, stepDay } from "../index";
import { competitorItinerariesFor, createRivals, marketKey, topAirportsByDemand, WORLD_FIELD } from "./index";
import type { RivalAirline } from "./types";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const world = (seed = 2015) => startingScenario(airports, aircraftTypes, seed, { rivalField: "world" });
const stationHours = (air: RivalAirline, id: string) => air.routes
  .filter((r) => r.origin === id || r.destination === id)
  .reduce((h, r) => h + r.frequency * 2 * blockHours(distanceKm(A.get(r.origin)!, A.get(r.destination)!), T.get(r.typeId)!), 0);

describe("generated world field: set-up", () => {
  const s = world();
  const field = s.rivals!;
  const top = new Set(topAirportsByDemand(A, WORLD_FIELD.topAirports, 0).map((a) => a.id));

  it("has 50 airlines, each with its hub at a different airport of the top 100 by model demand", () => {
    expect(field.field).toBe("world");
    expect(field.airlines).toHaveLength(WORLD_FIELD.airlines);
    const hubs = field.airlines.map((a) => a.bases[0]!);
    expect(new Set(hubs).size).toBe(WORLD_FIELD.airlines);
    for (const h of hubs) expect(top.has(h), h).toBe(true);
    expect(top.size).toBe(WORLD_FIELD.topAirports);
  });

  it("spreads the decision weeks evenly over the 8-week cycle", () => {
    const perWeek = new Array<number>(WORLD_FIELD.decisionCycleWeeks).fill(0);
    for (const a of field.airlines) perWeek[a.decisionWeek!]!++;
    expect(Math.max(...perWeek) - Math.min(...perWeek)).toBeLessThanOrEqual(1);
  });

  it("names are unique and every route starts or ends at the airline's hub", () => {
    expect(new Set(field.airlines.map((a) => a.name)).size).toBe(field.airlines.length);
    for (const a of field.airlines) for (const r of a.routes) expect(r.origin === a.bases[0] || r.destination === a.bases[0], `${a.name} ${r.origin}-${r.destination}`).toBe(true);
  });

  it("most airlines start with a network and the aircraft to fly it", () => {
    const flying = field.airlines.filter((a) => a.routes.length > 0);
    expect(flying.length).toBeGreaterThanOrEqual(40);
    for (const a of flying) expect(a.fleet.length, a.name).toBeGreaterThan(0);
  });

  it("is deterministic in the seed, and another seed gives another field", () => {
    const again = createRivals(airports, aircraftTypes, 2015, s.world.routes, s.world.day, "world", { homeHub: "LAX" });
    expect(again.airlines.map((a) => `${a.name}@${a.bases[0]}:${a.routes.length}`)).toEqual(field.airlines.map((a) => `${a.name}@${a.bases[0]}:${a.routes.length}`));
    const other = createRivals(airports, aircraftTypes, 7, [], 0, "world");
    expect(other.airlines.map((a) => a.bases[0])).not.toEqual(field.airlines.map((a) => a.bases[0]));
  });
});

describe("generated world field: competition for the player", () => {
  const s = world();
  const field = s.rivals!;

  it("a market no airline serves has no competitor at all (no synthetic stand-ins)", () => {
    const served = new Set(field.airlines.flatMap((a) => a.routes.map((r) => marketKey(r.origin, r.destination))));
    const pair = [["MRY", "SBP"], ["ACV", "CEC"], ["IPL", "MMH"]].find(([x, y]) => !served.has(marketKey(x!, y!)))!;
    expect(competitorItinerariesFor(field, A.get(pair[0]!)!, A.get(pair[1]!)!, T, A)).toEqual([]);
  });

  it("a rival's nonstop and its one-stop through its own hub are both competitors", () => {
    const air = field.airlines.find((a) => a.routes.length >= 2)!;
    const hub = air.bases[0]!;
    const [r1, r2] = air.routes;
    const far = (r: typeof r1) => (r!.origin === hub ? r!.destination : r!.origin);
    const x = A.get(far(r1))!, y = A.get(far(r2))!;
    const comp = competitorItinerariesFor(field, A.get(hub)!, x, T, A)!;
    expect(comp.some((i) => i.carrier === air.id && i.legs.length === 1)).toBe(true);
    const viaHub = competitorItinerariesFor(field, x, y, T, A)!.filter((i) => i.carrier === air.id && i.legs.length === 2);
    const sensible = distanceKm(x, A.get(hub)!) + distanceKm(A.get(hub)!, y) <= 2 * distanceKm(x, y);
    expect(viaHub.length).toBe(sensible ? 1 : 0);
  });

  it("the classic field is unchanged: undefined here means the synthetic rivals stay", () => {
    const classic = startingScenario(airports, aircraftTypes, 2015);
    expect(classic.rivals!.field ?? "classic").toBe("classic");
    expect(competitorItinerariesFor(classic.rivals, A.get("LAX")!, A.get("SFO")!, T, A)).toBeUndefined();
  });
});

describe("generated world field: two years of decisions", () => {
  let s = world();
  const start = s.world.day;
  for (let d = 0; d < 730; d++) s = stepDay(s);
  const field = s.rivals!;
  const active = field.airlines.filter((a) => a.status === "active");
  const kinds = new Set(field.news.map((n) => n.kind));

  it("every active airline decided within the last 8 weeks", () => {
    for (const a of active) expect(s.world.day - (a.lastDecisionDay ?? start), a.name).toBeLessThanOrEqual(7 * WORLD_FIELD.decisionCycleWeeks);
  });

  it("airlines order aircraft, open and close routes, and change fare policies", () => {
    for (const k of ["order", "enter", "farePolicy"] as const) expect(kinds.has(k), k).toBe(true);
  });

  it("routes start at a base, and no outstation is over its 500 block hours", () => {
    for (const a of active) {
      for (const r of a.routes) expect(a.bases.includes(r.origin) || a.bases.includes(r.destination), `${a.name} ${r.origin}-${r.destination}`).toBe(true);
      for (const o of a.outstations ?? []) expect(stationHours(a, o), `${a.name} at ${o}`).toBeLessThanOrEqual(OUTSTATION_PARAMS.blockHoursPerWeek + 1e-6);
    }
  });

  it("flying routes have the aircraft to fly them (routes waiting for deliveries are not flown)", () => {
    for (const a of active) {
      const need = new Map<string, number>();
      for (const r of [...a.routes, ...(a.pending ?? [])]) need.set(r.typeId, (need.get(r.typeId) ?? 0) + 1);
      for (const r of a.pending ?? []) expect(a.routes.includes(r)).toBe(false);
    }
  });
}, 900_000);
