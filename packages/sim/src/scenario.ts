import type { Aircraft, AircraftType, Airport, Route } from "@arg/contracts";
import { benchmarkFareFor } from "./demand/fares";
import { hasSurfaceAlternative, pairMarket } from "./demand/market";
import { applyCommand } from "./commands";
import { catchmentOf, DEFAULT_METROS } from "./demand/metros";
import { previewNewRoute } from "./route/liveModel";
import { airportOpen, closureOf } from "./world/closures";
import { defaultLayout } from "./fleet/layout";
import { distanceKm } from "./geo";
import { regionGroupOf } from "./world/regions";
import { makeRng, mixSeed } from "./rng";
import { newSim, stepDay, type StartOptions } from "./index";
import { inProduction } from "./fleet/availability";
import { jan1Day, START_YEAR } from "./time/calendar";
import { startYearError } from "./time/startYear";
import { createRivals } from "./rivals";
import type { SimState } from "./state";

/** Placeholder airline for the 2015 campaign. */
export const STARTING_AIRLINE = "Skybridge Pacific";
export const STARTING_CASH_USD = 150_000_000;

/** Starting fleet by type id (ids from @arg/data). */
export const STARTING_FLEET: ReadonlyArray<readonly [typeId: string, count: number]> = [
  ["B737-800", 3],
  ["A320", 1],
  ["B757-200", 2],
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
 * Starting economy fare for a pair. Drivable short sectors cannot hold the benchmark curve (LAX-SAN at the benchmark 81 USD
 * flew 17% full): the fare falls linearly from the benchmark at 400 km to 60% of it at zero distance, i.e. about 63 USD
 * for LAX-SAN (180 km). A grid search over fare and frequency (MODEL.md section 8) puts the profit optimum for LAX-SAN at
 * 14 to 16 round trips a week at 62-65 USD with 74-79% load factor, which is where the starting scenario sits.
 */
export function startingFare(a: Airport, b: Airport): number {
  const d = distanceKm(a, b);
  const bench = benchmarkFareFor(a, b, d);
  if (!hasSurfaceAlternative(a, b) || d >= 400) return Math.round(bench);
  return Math.round(bench * (0.6 + (0.4 * d) / 400));
}

/** Where the airline starts. Default: Skybridge Pacific at LAX with the hand-tuned four routes (identical to the original scenario). */
export interface ScenarioOptions {
  /** Home airport id. Any other hub than LAX gets routes derived from the data (see `deriveHubRoutes`). */
  hub?: string;
  /** Airline name (trimmed, at most 40 characters). */
  name?: string;
  /** Campaign start year (whole year, 1965 or later, see `startYearError`). Default 2015, the original scenario. */
  startYear?: number;
  /** The caller's notion of the current year, for validating `startYear` (the sim never reads a clock). Default: the start year. */
  presentYear?: number;
}

/** Fleet plan of a start year: aircraft type ids with counts, and the hub slots (type id and distance band) for derived routes. */
export interface EraPlan {
  fleet: ReadonlyArray<readonly [typeId: string, count: number]>;
  slots: ReadonlyArray<{ typeId: string; minKm: number; maxKm: number }>;
  day: number;
}

/**
 * The aircraft type that stands in for `typeId` in a start year: a type in production that year, preferring the same wide/narrow body
 * class, nearest in seats to the original. Deterministic (ties by id). Undefined when nothing is in production that year.
 */
export function eraTypeFor(types: readonly AircraftType[], typeId: string, year: number): AircraftType | undefined {
  const orig = types.find((t) => t.id === typeId);
  const pool = types.filter((t) => inProduction(t, year));
  if (!orig || pool.length === 0) return undefined;
  const sameBody = pool.filter((t) => t.widebody === orig.widebody);
  const cands = sameBody.length > 0 ? sameBody : pool;
  return [...cands].sort((a, b) => Math.abs(a.maxSeats - orig.maxSeats) - Math.abs(b.maxSeats - orig.maxSeats) || (a.id < b.id ? -1 : 1))[0];
}

/** Era fleet and hub slots for a start year other than 2015: the default plan with each type replaced by `eraTypeFor`. */
export function eraPlanFor(types: readonly AircraftType[], year: number): EraPlan {
  const counts = new Map<string, number>();
  for (const [typeId, n] of STARTING_FLEET) {
    const t = eraTypeFor(types, typeId, year);
    if (!t) throw new Error(`startingScenario: no aircraft in production in ${year}`);
    counts.set(t.id, (counts.get(t.id) ?? 0) + n);
  }
  const slots = HUB_SLOTS.map((s) => {
    const t = eraTypeFor(types, s.typeId, year);
    if (!t) throw new Error(`startingScenario: no aircraft in production in ${year}`);
    return { typeId: t.id, minKm: s.minKm, maxKm: s.maxKm };
  });
  return { fleet: [...counts], slots, day: jan1Day(year) };
}

export const DEFAULT_HUB = "LAX";

/** Shortest runway a hub may have: below this the starting 737/A320/757/777 fleet cannot operate (Sao Paulo Congonhas, 1,940 m). */
export const HUB_MIN_RUNWAY_M = 2000;
/**
 * The largest airports a player may pick as a hub: sorted by `slotsPerHour` (derived from 2015 passenger counts, see SOURCES.md) then by
 * metro population, only airports that exist for the whole campaign (no opening or closure dates) and that are not minor airports of a multi-airport city (metro share of 10% or less: ONT, SNA, BUR, LGB, HPN...), at most `max` of them. LAX is always
 * included and listed first (the default hub).
 */
export function hubCandidates(airports: readonly Airport[], max = 60): Airport[] {
  const ok = airports.filter((a) => a.id !== DEFAULT_HUB && a.runwayM >= HUB_MIN_RUNWAY_M && airportOpen(a.id, 0) && !closureOf(a.id) && catchmentOf(a.id, a.metroPopulation, DEFAULT_METROS).share > 0.1);
  ok.sort((x, y) => y.slotsPerHour - x.slotsPerHour || y.metroPopulation - x.metroPopulation || (x.id < y.id ? -1 : 1));
  const lax = airports.find((a) => a.id === DEFAULT_HUB);
  return [...(lax ? [lax] : []), ...ok.slice(0, lax ? max - 1 : max)];
}

/** Registration prefixes for the starting fleet by country (cosmetic). */
const REG_PREFIX: Record<string, string> = {
  GB: "G", DE: "D", FR: "F", ES: "EC", IT: "I", NL: "PH", IE: "EI", CH: "HB", AT: "OE", BE: "OO", PT: "CS", SE: "SE", NO: "LN",
  DK: "OY", FI: "OH", PL: "SP", GR: "SX", CZ: "OK", HU: "HA", IS: "TF",
  // Outside Europe (ITU allocations: Canada C, Mexico XA, Brazil PP, Argentina LV, Chile CC, Colombia HK, Peru OB, UAE A6, Qatar A7,
  // Saudi Arabia HZ, Turkey TC, Israel 4X, Egypt SU, Morocco CN, South Africa ZS, Kenya 5Y, Nigeria 5N, Ethiopia ET, India VT, Pakistan AP,
  // Japan JA, Korea HL, China B, Taiwan B, Hong Kong B, Singapore 9V, Malaysia 9M, Thailand HS, Vietnam VN, Indonesia PK, Philippines RP,
  // Australia VH, New Zealand ZK, Fiji DQ).
  CA: "C", MX: "XA", BR: "PP", AR: "LV", CL: "CC", CO: "HK", PE: "OB", AE: "A6", QA: "A7", SA: "HZ", TR: "TC", IL: "4X", EG: "SU", MA: "CN", ZA: "ZS",
  KE: "5Y", NG: "5N", ET: "ET", IN: "VT", PK: "AP", JP: "JA", KR: "HL", CN: "B", TW: "B", HK: "B", SG: "9V", MY: "9M", TH: "HS", VN: "VN", ID: "PK",
  PH: "RP", AU: "VH", NZ: "ZK", FJ: "DQ",
};
function tailFor(n: number, hub: Airport): string {
  if (hub.country === "US" || regionGroupOf(hub.country) === "us") return `N${String(n).padStart(3, "0")}SP`;
  return `${REG_PREFIX[hub.country] ?? "XA"}-S${String(n).padStart(2, "0")}`;
}

/** Slots for the derived routes, in order: which owned type flies it and which distance band (km) it should sit in. */
const HUB_SLOTS: ReadonlyArray<{ typeId: string; minKm: number; maxKm: number }> = [
  { typeId: "B777-200ER", minKm: 3500, maxKm: 12000 },
  { typeId: "B737-800", minKm: 250, maxKm: 1800 },
  { typeId: "A320", minKm: 250, maxKm: 1800 },
  { typeId: "B757-200", minKm: 1200, maxKm: 5000 },
];
const HUB_FREQUENCIES = [3, 5, 7, 10, 14, 21, 28, 35, 42] as const;
const HUB_CANDIDATE_LIMIT = 40;

/**
 * Starting routes for a hub other than LAX: for each slot of `HUB_SLOTS`, the highest-demand destination (in the slot's distance band) that
 * the slot's owned type may legally fly, at the weekly frequency whose modelled weekly profit is best while the owned aircraft can
 * actually operate it. A destination whose best option loses money is skipped; if fewer than three routes are found the bands are
 * widened. Pure and deterministic (no randomness); every returned route passes the same checks as the player's open-route command.
 */
export function deriveHubRoutes(airports: Airport[], aircraftTypes: AircraftType[], fleet: Aircraft[], hub: Airport, seed: number, era?: EraPlan): Route[] {
  const typeById = new Map(aircraftTypes.map((t) => [t.id, t]));
  const startFleetCount = new Map(era ? era.fleet : STARTING_FLEET);
  const slots = era ? era.slots : HUB_SLOTS;
  const day = era ? era.day : 0;
  const byDemand = airports
    .filter((o) => o.id !== hub.id && airportOpen(o.id, day))
    .map((o) => ({ o, w: pairMarket(hub, o).baseWeekly }))
    .sort((x, y) => y.w - x.w || (x.o.id < y.o.id ? -1 : 1))
    .map((x) => x.o);
  const base = newSim(seed, airports, aircraftTypes, { notionalFleet: false }, { cash: STARTING_CASH_USD, fleet, routes: [], airlineName: STARTING_AIRLINE, baseAirport: hub.id, day });
  const chosen: Route[] = [];
  const used = new Set<string>();
  const usedTypeLoad = new Map<string, number>();

  const trySlot = (slot: { typeId: string; minKm: number; maxKm: number }, allowLoss = false): boolean => {
    const type = typeById.get(slot.typeId);
    if (!type) return false;
    const owned = startFleetCount.get(slot.typeId) ?? 0;
    const state = { ...base, world: { ...base.world, routes: chosen.map((r) => ({ ...r, fares: { ...r.fares } })) }, counters: { ...base.counters, route: chosen.length } };
    let best: { route: Route; score: number } | null = null;
    let seen = 0;
    for (const o of byDemand) {
      if (used.has(o.id)) continue;
      const d = distanceKm(hub, o);
      if (d < slot.minKm || d > slot.maxKm) continue;
      if (++seen > HUB_CANDIDATE_LIMIT) break;
      const y = startingFare(hub, o);
      const fares = type.widebody ? { Y: y, J: Math.round(y * 3.2) } : { Y: y };
      for (const f of HUB_FREQUENCIES) {
        const draft = { origin: hub.id, destination: o.id, weeklyFrequency: f, fares, typeId: slot.typeId };
        const ok = applyCommand(state, { kind: "openRoute", route: draft }).result.ok;
        if (!ok) break;
        const pv = previewNewRoute(state, draft);
        if (!pv || !pv.figures.feasible || pv.operatedFraction < 0.97) continue;
        const need = pv.figures.aircraftEquivalent;
        if (need + (usedTypeLoad.get(slot.typeId) ?? 0) > owned) continue;
        // Profit per week, with a mild preference for routes that use the aircraft well and fill them.
        const score = pv.figures.profit > 0 || !allowLoss ? pv.figures.profit * (pv.figures.loadFactor >= 0.55 ? 1 : 0.5) : pv.figures.profit;
        if ((pv.figures.profit > 0 || allowLoss) && (!best || score > best.score)) best = { route: { id: "", ...draft }, score };
      }
      if (best && seen >= 8) break; // enough of the demand-ranked list looked at
    }
    if (!best) return false;
    const r = { ...best.route, id: `route-${chosen.length + 1}` };
    const pv = previewNewRoute(state, r)!;
    usedTypeLoad.set(slot.typeId, (usedTypeLoad.get(slot.typeId) ?? 0) + pv.figures.aircraftEquivalent);
    used.add(r.destination);
    chosen.push(r);
    return true;
  };

  for (const slot of slots) trySlot(slot);
  // Remote or thin hubs: widen the bands until there are at least three routes.
  for (const widen of [{ minKm: 100, maxKm: 4000 }, { minKm: 100, maxKm: 12000 }]) {
    for (const slot of slots) {
      if (chosen.length >= 3) break;
      trySlot({ typeId: slot.typeId, ...widen });
    }
  }
  // Thin hubs (Johannesburg, Brasilia...): still short of three routes, accept the least-losing feasible ones rather than a stub network.
  for (const widen of [{ minKm: 100, maxKm: 4000 }, { minKm: 100, maxKm: 12000 }]) {
    for (const slot of slots) {
      if (chosen.length >= 3) break;
      trySlot({ typeId: slot.typeId, ...widen }, true);
    }
  }
  return chosen;
}

/**
 * Lower the frequency of any route the owned fleet cannot fully operate (the scheduler shares aircraft across routes, so a route that
 * looked fully flown on its own can end up short once the others are added) until the whole network is fully scheduled, using one real
 * day of the sim. Also reports which aircraft the scheduler used.
 */
function settleRoutes(airports: Airport[], aircraftTypes: AircraftType[], fleet: Aircraft[], routes: Route[], seed: number, hub: Airport, day = 0): { routes: Route[]; usedAircraft: Set<string> } {
  let cur = routes.map((r) => ({ ...r, fares: { ...r.fares } }));
  let used = new Set<string>();
  for (let iter = 0; iter < 40; iter++) {
    const probe = newSim(seed, airports, aircraftTypes, { notionalFleet: false }, { cash: STARTING_CASH_USD, fleet, routes: cur, airlineName: STARTING_AIRLINE, baseAirport: hub.id, day });
    const st = stepDay(probe);
    used = new Set<string>();
    let worst: { r: Route; frac: number } | null = null;
    for (const r of cur) {
      const rep = st.routeReports[r.id];
      for (const id of rep?.scheduling?.aircraftIds ?? []) used.add(id);
      const frac = rep ? rep.operatedFraction : 1;
      if (frac < 0.97 && (!worst || frac < worst.frac)) worst = { r, frac };
    }
    if (!worst) break;
    const target = worst.r.weeklyFrequency * worst.frac;
    const lower = [...HUB_FREQUENCIES].reverse().find((f) => f <= Math.floor(target + 1e-9)) ?? 1;
    cur = cur.map((r) => (r.id === worst!.r.id ? { ...r, weeklyFrequency: Math.min(lower, r.weeklyFrequency - 1) } : r));
  }
  return { routes: cur, usedAircraft: used };
}

/**
 * The 2015 starting position: an airline with 150M USD and a fleet of up to 8 aircraft, a few routes (LAX default: Skybridge Pacific at LAX,
 * four hand-tuned routes). Every aircraft has a plausible age and staggered check history (seeded). Types are looked up by id, so the
 * function throws if the supplied aircraft data lacks one of the starting types or airports.
 * `options.hub` picks another home airport: the routes are then derived (`deriveHubRoutes`) and the fleet is trimmed to what they need.
 */
export function startingScenario(airports: Airport[], aircraftTypes: AircraftType[], seed = 2015, options: ScenarioOptions = {}): SimState {
  const typeById = new Map(aircraftTypes.map((t) => [t.id, t]));
  const apById = new Map(airports.map((a) => [a.id, a]));
  const hubId = options.hub ?? DEFAULT_HUB;
  const hub = apById.get(hubId);
  if (!hub) throw new Error(`startingScenario: hub airport ${hubId} not in data`);
  const airlineName = (options.name ?? "").trim().slice(0, 40) || STARTING_AIRLINE;
  const custom = hubId !== DEFAULT_HUB;
  const startYear = options.startYear ?? START_YEAR;
  const yearErr = startYearError(startYear, options.presentYear ?? startYear, aircraftTypes);
  if (yearErr) throw new Error(`startingScenario: ${yearErr}`);
  // 2015 keeps the hand-tuned scenario exactly; any other start year uses the aircraft in production that year.
  const era = startYear === START_YEAR ? null : eraPlanFor(aircraftTypes, startYear);
  const plan: ReadonlyArray<readonly [string, number]> = era ? era.fleet : STARTING_FLEET;
  const startDay = era ? era.day : 0;

  const buildFleet = (counts: ReadonlyMap<string, number>): Aircraft[] => {
    const rng = makeRng(mixSeed(seed, 0xf1ee7));
    const fleet: Aircraft[] = [];
    let n = 0;
    for (const [typeId, count] of plan) {
      const type = typeById.get(typeId);
      if (!type) throw new Error(`startingScenario: aircraft type ${typeId} not in data`);
      for (let i = 0; i < count; i++) {
        // The random draws are made for every aircraft of the default fleet so that kept aircraft age identically whatever is trimmed.
        const ageYears = 2 + rng() * 12;
        const a = Math.round(rng() * 450);
        if (i >= (counts.get(typeId) ?? 0)) continue;
        n++;
        fleet.push({
          id: `ac-${n}`,
          typeId,
          tailNumber: tailFor(n, hub),
          layout: defaultLayout(type),
          status: "active",
          ageDays: Math.round(ageYears * 365),
          hoursSinceCheck: { A: a, B: 0, C: 0, D: 0 },
        });
      }
    }
    return fleet;
  };
  const full = new Map(plan);
  const fleetFull = buildFleet(full);

  let routes: Route[];
  let fleet = fleetFull;
  if (!custom && !era) {
    routes = STARTING_ROUTES.map(([o, d, freq, typeId], i) => {
      const a = apById.get(o);
      const b = apById.get(d);
      if (!a || !b) throw new Error(`startingScenario: airport ${o} or ${d} not in data`);
      const y = startingFare(a, b);
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
  } else {
    const derive = era ?? undefined;
    const first = settleRoutes(airports, aircraftTypes, fleetFull, deriveHubRoutes(airports, aircraftTypes, fleetFull, hub, seed, derive), seed, hub, startDay);
    // Keep only the aircraft the scheduler actually used (at least one of each type that has a route), so the airline starts without idle metal.
    const keep = new Map<string, number>();
    const byId = new Map(fleetFull.map((a) => [a.id, a]));
    for (const id of first.usedAircraft) { const t = byId.get(id)!.typeId; keep.set(t, (keep.get(t) ?? 0) + 1); }
    for (const r of first.routes) if (!keep.has(r.typeId)) keep.set(r.typeId, 1);
    fleet = buildFleet(keep);
    routes = settleRoutes(airports, aircraftTypes, fleet, first.routes, seed, hub, startDay).routes;
  }
  const opts: StartOptions = { cash: STARTING_CASH_USD, fleet, routes, airlineName, baseAirport: hubId, day: startDay };
  const sim = newSim(seed, airports, aircraftTypes, { notionalFleet: false }, opts);
  return { ...sim, rivals: createRivals(airports, aircraftTypes, seed, sim.world.routes, startDay) };
}
