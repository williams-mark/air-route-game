import type { Aircraft, AircraftType, Airport, CabinClass, Day, Fares, MarketSnapshot, Route, ServiceLevel } from "@arg/contracts";
import {
  benchmarkFare,
  DEFAULT_CHOICE_PARAMS,
  runChoice,
  type ChoiceParams,
  type ChoiceResult,
  type Itinerary,
  type Leg,
} from "../demand/choice";
import { benchmarkFareFor, outsideFor } from "../demand/fares";
import { marketOnDay, SEGMENTS, segmentMap, type DayMarket, type MarketParams, DEFAULT_MARKET_PARAMS } from "../demand/market";
import { distanceKm } from "../geo";
import { cabinFillRatios, layoutEffects } from "../cabin/effects";
import { combineExperience, experienceFareMultipliers, experienceProfile, type RouteExperience } from "../cabin/experience";
import { defaultLayout } from "../fleet/layout";
import { rivalSizingMarket } from "./rivalSizing";
import {
  aircraftEquivalentFor,
  blockHours,
  evaluateRoute,
  mergeEvaluations,
  type CabinInput,
  type RouteEvaluation,
} from "../finance/ledger";

/** Typical premium fare multipliers over the Y fare when a route does not price a cabin explicitly. */
export const PREMIUM_FARE_MULTIPLIER: Record<CabinClass, number> = { F: 5, J: 3.2, W: 1.7, Y: 1 };
/** Default layout shares of seats when a route has no fleet aircraft assigned yet. */
export const DEFAULT_SEAT_FRACTION = { narrow: 0.9, wide: 0.7 } as const;

/** Choice parameters used by the route model: soft capacity spill and seat-share weighting switched on. */
export const ROUTE_CHOICE_PARAMS: ChoiceParams = {
  ...DEFAULT_CHOICE_PARAMS,
  spillCv: 0.2,
  fareScaleExponent: 1,
  capacityShareExponent: 1,
};

export interface RouteModelConfig {
  market: MarketParams;
  choice: ChoiceParams;
  /** Competitor target load factor used to size rival capacity. */
  rivalTargetLoadFactor: number;
  /** Competitor fare = benchmark fare x this. */
  rivalFareFactor: number;
  rivalQuality: number;
  /** Rival one-stop itinerary is added for pairs at least this long (km). */
  rivalConnectingMinKm: number;
  rivalConnectingFareFactor: number;
  /** Rivals' combined seats serve this fraction of the annual-average potential market (at the target load factor). */
  rivalMarketCoverage: number;
  /** Rival count by potential one-way weekly demand: [upTo, count] pairs, last entry applies above. */
  rivalCountBands: ReadonlyArray<readonly [upToWeekly: number, count: number]>;
  /** Capacity split, fare multiplier and quality offset of rivals 1..3 (first n used). */
  rivalProfiles: ReadonlyArray<{ seatShare: number; fareFactor: number; quality: number }>;
}

export const DEFAULT_ROUTE_MODEL_CONFIG: RouteModelConfig = {
  market: DEFAULT_MARKET_PARAMS,
  choice: ROUTE_CHOICE_PARAMS,
  rivalTargetLoadFactor: 0.8,
  rivalFareFactor: 1.0,
  rivalQuality: 0.5,
  rivalConnectingMinKm: 800,
  rivalConnectingFareFactor: 0.85,
  rivalMarketCoverage: 0.8,
  rivalCountBands: [[1500, 1], [6000, 2], [Infinity, 3]],
  rivalProfiles: [
    { seatShare: 0.45, fareFactor: 1.0, quality: 0.55 },
    { seatShare: 0.33, fareFactor: 0.96, quality: 0.5 },
    { seatShare: 0.22, fareFactor: 1.05, quality: 0.45 },
  ],
};

/**
 * Premium cabins earn less over economy on short sectors (a 12-seat domestic first class on a 540 km hop sells at about 2x
 * economy, not 3.2x). Scales the unpriced-cabin multiplier from 0.55 at zero distance to 1.0 at 3500 km and beyond.
 */
export function premiumDistanceFactor(distKm: number): number {
  return 0.55 + 0.45 * Math.min(1, Math.max(0, distKm) / 3500);
}

/**
 * Cabins of a route on one aircraft (or the notional split when there is none). Premium fares carry the cabin's passenger-experience
 * multiplier (cabin/experience.ts, 1 for the reference cabin and for economy); `serviceLevels` is the airline's setting per cabin.
 */
export function cabinsFor(route: Pick<Route, "fares">, type: AircraftType, aircraft: Aircraft | undefined, distKm?: number, serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>): CabinInput[] {
  const pf = distKm === undefined ? 1 : premiumDistanceFactor(distKm);
  const going = (cls: CabinClass) => (cls === "Y" ? 1 : PREMIUM_FARE_MULTIPLIER[cls] * pf);
  const xm = aircraft ? experienceFareMultipliers(type, aircraft.layout, aircraft.ageDays / 365.25, serviceLevels) : {};
  const expMult = (cls: CabinClass) => xm[cls] ?? 1;
  const fareFor = (cls: CabinClass, fares: Fares) => (fares[cls] ?? fares.Y * going(cls)) * expMult(cls);
  /** Premium cabins priced above the multiple they support (going multiple x experience) fill less: weight (supported / actual)^2, so revenue falls as 1/multiple. */
  const fillScale = (cls: CabinClass, fares: Fares) => {
    if (cls === "Y") return 1;
    const actual = fareFor(cls, fares) / Math.max(1e-9, fares.Y);
    const supported = going(cls) * expMult(cls);
    return actual > supported ? (supported / actual) ** 2 : 1;
  };
  if (aircraft) {
    const bySection = new Map<CabinClass, number>();
    for (const s of aircraft.layout.sections) {
      bySection.set(s.cls, (bySection.get(s.cls) ?? 0) + s.rows * s.seatsAcross);
    }
    const out: CabinInput[] = [];
    for (const cls of ["F", "J", "W", "Y"] as const) {
      const seats = bySection.get(cls);
      if (seats) out.push({ cls, seats, fare: fareFor(cls, route.fares), fillScale: fillScale(cls, route.fares) });
    }
    if (out.length > 0) return out;
  }
  const total = Math.floor(type.maxSeats * DEFAULT_SEAT_FRACTION[type.widebody ? "wide" : "narrow"]);
  const f = route.fares;
  const share: Record<CabinClass, number> = {
    F: f.F !== undefined ? 0.02 : 0,
    J: f.J !== undefined ? 0.08 : 0,
    W: f.W !== undefined ? 0.08 : 0,
    Y: 0,
  };
  const cabins: CabinInput[] = [];
  let used = 0;
  for (const cls of ["F", "J", "W"] as const) {
    const seats = Math.round(total * share[cls]);
    if (seats > 0) {
      cabins.push({ cls, seats, fare: fareFor(cls, f), fillScale: fillScale(cls, f) });
      used += seats;
    }
  }
  cabins.push({ cls: "Y", seats: total - used, fare: f.Y });
  return cabins;
}

/** Aircraft actually flying a route, grouped by type and cabin layout. `share` is the fraction of the round trips each group flies. */
export interface FleetGroup {
  type: AircraftType;
  /** A representative aircraft (provides the layout); undefined for the notional fleet of the requested type. */
  aircraft: Aircraft | undefined;
  share: number;
  count: number;
}

/**
 * Group the aircraft that fly a route by (type, layout), weighted by the round trips each one operates (`flights`, aircraft id
 * to round trips per week; default one each). Aircraft of unknown type are ignored. With no usable aircraft the result is a single
 * notional group of the requested type, so a route always has at least one group.
 */
export function fleetGroups(
  requested: AircraftType,
  fleet: readonly Aircraft[],
  types: ReadonlyMap<string, AircraftType>,
  flights?: Readonly<Record<string, number>>,
): FleetGroup[] {
  const byKey = new Map<string, { type: AircraftType; aircraft: Aircraft; weight: number; count: number }>();
  const weightOf = (ac: Aircraft) => Math.max(0, flights?.[ac.id] ?? 1);
  const anyWeight = fleet.some((ac) => weightOf(ac) > 0);
  for (const ac of fleet) {
    const type = types.get(ac.typeId);
    if (!type) continue;
    const w = anyWeight ? weightOf(ac) : 1;
    if (w <= 0) continue;
    const key = `${ac.typeId}|${JSON.stringify(ac.layout)}`;
    const cur = byKey.get(key);
    if (cur) { cur.weight += w; cur.count += 1; } else byKey.set(key, { type, aircraft: ac, weight: w, count: 1 });
  }
  const total = [...byKey.values()].reduce((x, g) => x + g.weight, 0);
  if (byKey.size === 0 || total <= 0) return [{ type: requested, aircraft: undefined, share: 1, count: 0 }];
  return [...byKey.values()].map((g) => ({ type: g.type, aircraft: g.aircraft, share: g.weight / total, count: g.count }));
}

/** Seats per flight averaged over the groups by the flights each flies. */
export function averageSeats(route: Pick<Route, "fares">, groups: readonly FleetGroup[], dist: number): number {
  return groups.reduce((s, g) => s + g.share * cabinsFor(route, g.type, g.aircraft, dist).reduce((x, c) => x + c.seats, 0), 0);
}

/**
 * Evaluate a route with the ledger for each fleet group (own type, layout, costs) and merge. No cabin-lane effects: used by the
 * network model, which re-prices a route with extra passengers aboard.
 */
export function evaluateWithFleet(args: {
  route: Route; a: Airport; b: Airport; requested: AircraftType; groups: readonly FleetGroup[]; day: Day;
  weeklyPassengers: number; operatedFraction: number; ownership: "fractional" | "excluded";
  serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>;
}) {
  const { route, a, b, groups } = args;
  const dist = distanceKm(a, b);
  const seats = groups.map((g) => g.share * cabinsFor(route, g.type, g.aircraft, dist, args.serviceLevels).reduce((x, c) => x + c.seats, 0));
  const totalSeats = seats.reduce((x, y) => x + y, 0);
  return mergeEvaluations(groups.map((g, i) => evaluateRoute({
    origin: a, destination: b, aircraft: g.type, day: args.day, weeklyFrequency: route.weeklyFrequency * g.share,
    cabins: cabinsFor(route, g.type, g.aircraft, dist, args.serviceLevels),
    weeklyPassengers: totalSeats > 0 ? (args.weeklyPassengers * seats[i]!) / totalSeats : 0,
    operatedFraction: args.operatedFraction, ownership: args.ownership,
  })));
}

function makeLeg(id: string, o: string, d: string, dist: number, speedKmh: number, freq: number, seats: number): Leg {
  return {
    id, origin: o, destination: d, distanceKm: dist,
    blockMin: ((dist * 1.04) / (speedKmh * 0.93) + 0.5) * 60,
    weeklyFrequency: freq, weeklySeats: freq * seats,
  };
}

/** Synthetic rest-of-market: 1-3 direct rivals sized to the annual-average market, plus a one-stop rival. */
export function buildRivals(a: Airport, b: Airport, dist: number, market: DayMarket, cfg: RouteModelConfig): Itinerary[] {
  const rivalSeats = dist > 3000 ? 250 : dist > 1200 ? 180 : dist < 400 && market.baseWeekly < 6000 ? 90 : 140;
  const nRivals = (cfg.rivalCountBands.find(([upTo]) => market.baseWeekly <= upTo) ?? cfg.rivalCountBands[cfg.rivalCountBands.length - 1]!)[1];
  const profiles = cfg.rivalProfiles.slice(0, nRivals);
  const profileTotal = profiles.reduce((s, r) => s + r.seatShare, 0);
  const totalRivalSeats = (market.baseWeekly * cfg.rivalMarketCoverage) / cfg.rivalTargetLoadFactor;
  const benchFare = benchmarkFareFor(a, b, dist) * cfg.rivalFareFactor;
  const rivals: Itinerary[] = [];
  let totalRivalFreq = 0;
  profiles.forEach((pf, k) => {
    const freq = Math.max(2, Math.ceil((totalRivalSeats * pf.seatShare) / profileTotal / rivalSeats));
    totalRivalFreq += freq;
    const id = `rival${k + 1}:${a.id}-${b.id}`;
    rivals.push({
      id, marketDistanceKm: dist, carrier: `rival${k + 1}`, fare: benchFare * pf.fareFactor, quality: pf.quality + (cfg.rivalQuality - 0.5),
      legs: [makeLeg(id, a.id, b.id, dist, 840, freq, rivalSeats)],
    });
  });
  if (dist >= cfg.rivalConnectingMinKm) {
    const f = Math.max(2, Math.ceil(totalRivalFreq / 4));
    rivals.push({
      id: `conn:${a.id}-${b.id}`, marketDistanceKm: dist, carrier: "conn", fare: benchFare * cfg.rivalConnectingFareFactor, quality: cfg.rivalQuality,
      legs: [
        makeLeg(`conn:${a.id}-hub`, a.id, "HUB", dist * 0.55, 840, f, rivalSeats),
        makeLeg(`conn:hub-${b.id}`, "HUB", b.id, dist * 0.7, 840, f, rivalSeats),
      ],
    });
  }
  return rivals;
}

export interface RouteWeek {
  route: Route;
  day: Day;
  market: DayMarket;
  choice: ChoiceResult;
  evaluation: RouteEvaluation;
  /** Passengers carried per week, one direction. */
  playerPassengersOneWay: number;
  snapshot: MarketSnapshot;
  /** Fraction of scheduled frequency actually flown (fleet limits). */
  operatedFraction: number;
  /** Passenger experience of the cabins flown (score and fare multiplier per cabin). */
  experience: RouteExperience;
}

export interface RouteWeekOptions {
  config?: RouteModelConfig;
  /** Aircraft flying the route, whatever their type. Capacity, speed, quality and operating costs come from each aircraft's own type and layout. */
  fleetAircraft?: Aircraft[];
  /** Round trips per week each aircraft operates on this route (aircraft id to count); weights the mix. Default: equal weights. */
  fleetFlights?: Readonly<Record<string, number>>;
  /** Multiplier on all demand (noise, events). */
  demandScale?: number;
  /** Fraction of frequency that fleet capacity allows (computed across routes by the caller). */
  operatedFraction?: number;
  /** Charge ownership via the ledger. Default: true when no fleet aircraft are supplied. */
  chargeOwnership?: boolean;
  /** Modelled rival itineraries for this pair (rivals lane). When non-empty they replace the synthetic direct rivals; the synthetic one-stop stays. */
  rivalItineraries?: Itinerary[];
  /** The airline's service level per cabin (absent = standard). Drives the premium fare multipliers. */
  serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>;
}

/**
 * Full weekly picture for one route on one day: demand -> choice (with a synthetic rival market)
 * -> ledger. Returns null if the route refers to unknown airports/types.
 */
export function simulateRouteWeek(
  route: Route,
  airports: ReadonlyMap<string, Airport>,
  types: ReadonlyMap<string, AircraftType>,
  day: Day,
  opts: RouteWeekOptions = {},
): RouteWeek | null {
  const cfg = opts.config ?? DEFAULT_ROUTE_MODEL_CONFIG;
  const a = airports.get(route.origin);
  const b = airports.get(route.destination);
  const type = types.get(route.typeId);
  if (!a || !b || !type || a.id === b.id) return null;

  const fleet = opts.fleetAircraft ?? [];
  const dist = distanceKm(a, b);
  const fraction = Math.max(0, Math.min(1, opts.operatedFraction ?? 1));
  const demandScale = opts.demandScale ?? 1;

  // Each group of aircraft (same type and layout) flies its share of the round trips with its own capacity, speed, quality and costs.
  const all = fleetGroups(type, fleet, types, opts.fleetFlights).map((g) => {
    const layout = g.aircraft?.layout;
    const fx = layout && layout.sections.length > 0 ? layoutEffects(g.type, layout) : null;
    const cabins = cabinsFor(route, g.type, g.aircraft, dist, opts.serviceLevels);
    const profile = experienceProfile(
      g.type,
      layout && layout.sections.length > 0 ? layout : defaultLayout(g.type),
      g.aircraft ? g.aircraft.ageDays / 365.25 : 0,
      opts.serviceLevels,
    );
    const feasible = evaluateRoute({
      origin: a, destination: b, aircraft: g.type, day, weeklyFrequency: route.weeklyFrequency, cabins,
      weeklyPassengers: 0, ownership: "excluded",
    }).feasible;
    return { g, layout, fx, cabins, feasible, profile, seats: cabins.reduce((s, c) => s + c.seats, 0) };
  });
  // Groups that cannot fly the pair carry nothing; if none can, the first is kept so the evaluation reports why.
  const usable = all.filter((x) => x.feasible);
  const feasibleAny = usable.length > 0;
  const shareSum = usable.reduce((s, x) => s + x.g.share, 0);
  const groups = (feasibleAny ? usable : all.slice(0, 1)).map((x) => ({ ...x, share: feasibleAny ? x.g.share / shareSum : 1 }));
  const avgSeats = groups.reduce((s, x) => s + x.share * x.seats, 0);
  const speed = groups.reduce((s, x) => s + x.share * x.g.type.cruiseKmh, 0);
  const quality = groups.reduce((s, x) => s + x.share * (x.fx ? x.fx.qualityIndex : 0.5), 0);
  const experience = combineExperience(groups.map((x) => ({
    weight: x.share,
    seats: Object.fromEntries(x.cabins.map((c) => [c.cls, c.seats])) as Partial<Record<CabinClass, number>>,
    profile: x.profile,
  })));

  const market = marketOnDay(a, b, day, cfg.market);
  const demand = segmentMap((s) => market.bySegment[s] * demandScale);

  const flownFreq = feasibleAny ? route.weeklyFrequency * fraction : 0;
  const player: Itinerary = {
    id: `player:${route.id}`,
    carrier: "player",
    legs: [makeLeg(`player:${route.id}`, a.id, b.id, dist, speed, flownFreq, avgSeats)],
    fare: route.fares.Y,
    quality,
    marketDistanceKm: dist,
  };

  const synthetic = buildRivals(a, b, dist, rivalSizingMarket(a, b, dist, market, demand, cfg.choice, (m) => buildRivals(a, b, dist, m, cfg)), cfg);
  const rivals = opts.rivalItineraries && opts.rivalItineraries.length > 0
    ? [...opts.rivalItineraries, ...synthetic.filter((i) => i.id.startsWith("conn:"))]
    : synthetic;

  const choice = runChoice({
    demand,
    itineraries: [player, ...rivals],
    outside: outsideFor(a, b, dist),
    params: cfg.choice,
  });
  const mine = choice.itineraries[0]!;
  // Cabin lane: premium cabins fill by the market's business/premium demand; crew and catering follow the cabin mix.
  const ownership = (opts.chargeOwnership ?? fleet.length === 0) ? "fractional" : "excluded";
  const evaluation = mergeEvaluations(groups.map((x) => {
    const paxShare = avgSeats > 0 ? (x.share * x.seats) / avgSeats : 1;
    let cabins = x.cabins;
    if (x.fx && x.layout && flownFreq > 0) {
      const paxPerFlight = (mine.passengers / flownFreq) * (avgSeats > 0 ? x.seats / avgSeats : 1);
      const ratios = cabinFillRatios(x.g.type, x.layout, paxPerFlight, { shares: market.shares, routeKm: dist });
      cabins = cabins.map((c) => ({ ...c, fillRatio: ratios[c.cls] }));
    }
    return evaluateRoute({
      origin: a, destination: b, aircraft: x.g.type, day, weeklyFrequency: route.weeklyFrequency * x.share, cabins,
      cabinCost: x.fx ? { paxServices: x.fx.serviceCostMultiplier, crewSeats: x.fx.crewSeatEquivalent } : undefined,
      weeklyPassengers: 2 * mine.passengers * paxShare,
      operatedFraction: fraction,
      ownership,
    });
  }));

  const captured = choice.totals.captured;
  const connPax = choice.itineraries.reduce((s, r, i) => s + (i > 0 && r.id.startsWith("conn:") ? r.passengers : 0), 0);
  const avgFare = captured > 0
    ? ([player, ...rivals].reduce((s, it, i) => s + it.fare * choice.itineraries[i]!.passengers, 0)) / captured
    : 0;
  const snapshot: MarketSnapshot = {
    origin: a.id,
    destination: b.id,
    weeklyDemand: SEGMENTS.reduce((s, g) => s + demand[g], 0),
    playerShare: captured > 0 ? mine.passengers / captured : 0,
    connectingShare: captured > 0 ? connPax / captured : 0,
    avgFare,
  };
  return { route, day, market, choice, evaluation, playerPassengersOneWay: mine.passengers, snapshot, operatedFraction: fraction, experience };
}

/** Allowed target load factor range (commands reject values outside it). */
export const TARGET_LOAD_FACTOR_RANGE = { min: 0.5, max: 0.95 } as const;
/** Economy fare multiplier search range, relative to the fares the route has when the solver runs. */
export const FARE_SCALE_BOUNDS = { min: 0.4, max: 2.5 } as const;
export const FARE_SCALE_ITERATIONS = 30;

/** Every fare class multiplied by `scale` (premium fares keep their ratio to economy). */
export function scaleFares(fares: Fares, scale: number): Fares {
  const out: Fares = { Y: fares.Y * scale };
  for (const c of ["F", "J", "W"] as const) if (fares[c] !== undefined) out[c] = fares[c]! * scale;
  return out;
}

/**
 * Economy fare multiplier (bisection over FARE_SCALE_BOUNDS, FARE_SCALE_ITERATIONS steps) whose load factor is closest to
 * `target`. `loadFactorAt` evaluates the route at the given fares through the same path as the live report and returns null
 * when the route cannot be flown (then the multiplier is 1). Load factor falls as fares rise, so the search keeps the probe
 * closest to the target. If the target is out of reach within the bounds, the nearest bound is returned.
 */
export function fareScaleForTargetLoadFactor(
  fares: Fares,
  target: number,
  loadFactorAt: (fares: Fares) => number | null,
): number {
  let best = { scale: 1, err: Infinity };
  const probe = (scale: number): number | null => {
    const lf = loadFactorAt(scaleFares(fares, scale));
    if (lf === null) return null;
    const err = Math.abs(lf - target);
    if (err < best.err) best = { scale, err };
    return lf;
  };
  let lo: number = FARE_SCALE_BOUNDS.min;
  let hi: number = FARE_SCALE_BOUNDS.max;
  const lfLo = probe(lo);
  const lfHi = probe(hi);
  if (lfLo === null || lfHi === null) return 1;
  if (lfLo <= target) return lo;
  if (lfHi >= target) return hi;
  for (let i = 0; i < FARE_SCALE_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const lf = probe(mid);
    if (lf === null) return 1;
    if (lf > target) lo = mid;
    else hi = mid;
  }
  return best.scale;
}

/** Fractional aircraft the route needs at full schedule. */
export function routeAircraftNeed(route: Route, airports: ReadonlyMap<string, Airport>, types: ReadonlyMap<string, AircraftType>): number {
  const a = airports.get(route.origin);
  const b = airports.get(route.destination);
  const t = types.get(route.typeId);
  if (!a || !b || !t) return 0;
  return aircraftEquivalentFor(distanceKm(a, b), t, route.weeklyFrequency);
}

export { blockHours };

// ---------------------------------------------------------------------------
// Hub connections
// ---------------------------------------------------------------------------

export interface HubConnectionInput {
  origin: Airport;
  hub: Airport;
  destination: Airport;
  /** The player's route between origin and hub (either direction). */
  leg1: Route;
  /** The player's route between hub and destination (either direction). */
  leg2: Route;
  types: ReadonlyMap<string, AircraftType>;
  day: Day;
  config?: RouteModelConfig;
  /** Aircraft flying each leg (first provides the cabin layout); optional. */
  fleet1?: Aircraft[];
  fleet2?: Aircraft[];
  /** Round trips per week each aircraft flies on the legs (aircraft id to count); weights mixed fleets. */
  flights1?: Readonly<Record<string, number>>;
  flights2?: Readonly<Record<string, number>>;
  /** Fraction of scheduled frequency flown on each leg. */
  operatedFraction1?: number;
  operatedFraction2?: number;
  /** Through fare (economy, one way). Default: 92% of the benchmark fare for the O&D distance. */
  connectingFare?: number;
  demandScale?: number;
  /** Precomputed local weeks of the two legs (as `simulateRouteWeek` returns them); avoids simulating them again. */
  week1?: RouteWeek | null;
  week2?: RouteWeek | null;
  /** One-way weekly seats on each leg already given to other connections (local traffic and earlier connections have priority). */
  reservedSeats1?: number;
  reservedSeats2?: number;
  /** The airline's service level per cabin (absent = standard). */
  serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>;
}

export interface HubLegLoad {
  routeId: string;
  /** Seats per week in the direction of travel. */
  seats: number;
  /** One-way weekly passengers on the leg who only travel this leg. */
  localPassengers: number;
  /** One-way weekly passengers on the leg who connect to or from the other leg. */
  connectingPassengers: number;
  loadFactor: number;
  /** Weekly (both directions) revenue of the leg's own O&D, from the route ledger. */
  localRevenue: number;
  /** Weekly (both directions) share of through-fare revenue prorated to this leg. */
  connectingRevenue: number;
  /** Weekly leg costs with local plus connecting passengers on board. */
  costs: number;
}

export interface HubConnection {
  market: DayMarket;
  choice: ChoiceResult;
  /** Through passengers per week in one direction. */
  connectingPassengers: number;
  throughFare: number;
  /** Fraction of the through fare prorated to leg 1 (by great-circle distance). */
  leg1ProrateShare: number;
  legs: [HubLegLoad, HubLegLoad];
  snapshot: MarketSnapshot;
}

/** Revenue attribution of a hub connection to its two legs. Weekly USD, both directions. */
export interface NetworkContribution {
  throughRevenue: number;
  legs: { routeId: string; localRevenue: number; connectingRevenue: number; revenue: number; costs: number; profit: number }[];
  /** Sum of prorated leg shares; equals `throughRevenue` (the proration check). */
  proratedTotal: number;
}

const sameMarket = (r: Route, x: Airport, y: Airport) =>
  (r.origin === x.id && r.destination === y.id) || (r.origin === y.id && r.destination === x.id);

/**
 * Evaluate the connecting market origin -> hub -> destination (e.g. SAN-HNL via LAX) using two player legs.
 *
 * Local traffic on each leg is simulated first with the normal route model and keeps its seats (local priority);
 * the through passengers choose among the player's connection (using whatever seats are left on both legs), the
 * synthetic rival direct flights and the rival one-stop. The existing connection penalty, layover and misconnect
 * logic of `itineraryUtility` applies. Through passengers are counted in the load of both legs, and the through fare is
 * prorated to the legs by great-circle distance. Returns null if the routes do not match the airports or a type is unknown.
 */
export function evaluateHubConnection(input: HubConnectionInput): HubConnection | null {
  const cfg = input.config ?? DEFAULT_ROUTE_MODEL_CONFIG;
  const { origin: a, hub: h, destination: b, leg1, leg2, types, day } = input;
  if (!sameMarket(leg1, a, h) || !sameMarket(leg2, h, b) || a.id === b.id) return null;
  const t1 = types.get(leg1.typeId);
  const t2 = types.get(leg2.typeId);
  if (!t1 || !t2) return null;
  const airports = new Map([a, h, b].map((x) => [x.id, x]));
  const f1 = input.operatedFraction1 ?? 1;
  const f2 = input.operatedFraction2 ?? 1;
  const demandScale = input.demandScale ?? 1;

  const opts = (fleet: Aircraft[] | undefined, flights: Readonly<Record<string, number>> | undefined, frac: number): RouteWeekOptions => ({
    config: cfg, fleetAircraft: fleet, fleetFlights: flights, operatedFraction: frac, demandScale, chargeOwnership: !fleet || fleet.length === 0,
    serviceLevels: input.serviceLevels,
  });
  const w1 = input.week1 ?? simulateRouteWeek(leg1, airports, types, day, opts(input.fleet1, input.flights1, f1));
  const w2 = input.week2 ?? simulateRouteWeek(leg2, airports, types, day, opts(input.fleet2, input.flights2, f2));
  if (!w1 || !w2) return null;

  const grp1 = fleetGroups(t1, input.fleet1 ?? [], types, input.flights1);
  const grp2 = fleetGroups(t2, input.fleet2 ?? [], types, input.flights2);
  const seats1 = leg1.weeklyFrequency * f1 * averageSeats(leg1, grp1, distanceKm(a, h));
  const seats2 = leg2.weeklyFrequency * f2 * averageSeats(leg2, grp2, distanceKm(h, b));
  const left1 = Math.max(0, seats1 - w1.playerPassengersOneWay - (input.reservedSeats1 ?? 0));
  const left2 = Math.max(0, seats2 - w2.playerPassengersOneWay - (input.reservedSeats2 ?? 0));
  const d1 = distanceKm(a, h);
  const d2 = distanceKm(h, b);
  const dist = distanceKm(a, b);
  const speedOf = (groups: FleetGroup[]) => groups.reduce((s, g) => s + g.share * g.type.cruiseKmh, 0);

  const market = marketOnDay(a, b, day, cfg.market);
  const demand = segmentMap((s) => market.bySegment[s] * demandScale);
  const throughFare = input.connectingFare ?? benchmarkFareFor(a, b, dist) * 0.92;
  const mk = (id: string, o: string, d: string, dd: number, groups: FleetGroup[], route: Route, frac: number, seats: number): Leg => ({
    ...makeLeg(id, o, d, dd, speedOf(groups), route.weeklyFrequency * frac, 1),
    weeklySeats: seats,
  });
  const player: Itinerary = {
    id: `player:${a.id}-${h.id}-${b.id}`,
    carrier: "player",
    fare: throughFare,
    quality: 0.5,
    marketDistanceKm: dist,
    legs: [
      mk(`player:${leg1.id}`, a.id, h.id, d1, grp1, leg1, f1, left1),
      mk(`player:${leg2.id}`, h.id, b.id, d2, grp2, leg2, f2, left2),
    ],
  };
  const rivals = buildRivals(a, b, dist, rivalSizingMarket(a, b, dist, market, demand, cfg.choice, (m) => buildRivals(a, b, dist, m, cfg)), cfg);
  const choice = runChoice({
    demand,
    itineraries: [player, ...rivals],
    outside: outsideFor(a, b, dist),
    params: cfg.choice,
  });
  const c = choice.itineraries[0]!.passengers;

  const share1 = d1 / (d1 + d2);
  const cost = (w: RouteWeek, route: Route, type: AircraftType, groups: FleetGroup[], fleet: Aircraft[] | undefined, frac: number, pax: number) =>
    evaluateWithFleet({
      route, a: airports.get(route.origin)!, b: airports.get(route.destination)!, requested: type, groups, day,
      weeklyPassengers: 2 * pax, operatedFraction: frac, ownership: !fleet || fleet.length === 0 ? "fractional" : "excluded",
      serviceLevels: input.serviceLevels,
    }).costs;
  const mkLeg = (w: RouteWeek, route: Route, type: AircraftType, cabins: FleetGroup[], fleet: Aircraft[] | undefined, frac: number, seats: number, share: number): HubLegLoad => {
    const local = w.playerPassengersOneWay;
    return {
      routeId: route.id,
      seats,
      localPassengers: local,
      connectingPassengers: c,
      loadFactor: seats > 0 ? (local + c) / seats : 0,
      localRevenue: w.evaluation.revenue,
      connectingRevenue: 2 * c * throughFare * share,
      costs: cost(w, route, type, cabins, fleet, frac, local + c),
    };
  };
  const captured = choice.totals.captured;
  const all = [player, ...rivals];
  const snapshot: MarketSnapshot = {
    origin: a.id,
    destination: b.id,
    weeklyDemand: SEGMENTS.reduce((s, g) => s + demand[g], 0),
    playerShare: captured > 0 ? c / captured : 0,
    connectingShare: captured > 0 ? all.reduce((s, it, i) => s + (it.legs.length > 1 ? choice.itineraries[i]!.passengers : 0), 0) / captured : 0,
    avgFare: captured > 0 ? all.reduce((s, it, i) => s + it.fare * choice.itineraries[i]!.passengers, 0) / captured : 0,
  };
  return {
    market,
    choice,
    connectingPassengers: c,
    throughFare,
    leg1ProrateShare: share1,
    legs: [mkLeg(w1, leg1, t1, grp1, input.fleet1, f1, seats1, share1), mkLeg(w2, leg2, t2, grp2, input.fleet2, f2, seats2, 1 - share1)],
    snapshot,
  };
}

/** Attribute the through revenue of a hub connection to its legs (already prorated) and add each leg's own traffic. */
export function networkContribution(conn: HubConnection): NetworkContribution {
  const legs = conn.legs.map((l) => {
    const revenue = l.localRevenue + l.connectingRevenue;
    return { routeId: l.routeId, localRevenue: l.localRevenue, connectingRevenue: l.connectingRevenue, revenue, costs: l.costs, profit: revenue - l.costs };
  });
  return {
    throughRevenue: 2 * conn.connectingPassengers * conn.throughFare,
    legs,
    proratedTotal: legs.reduce((s, l) => s + l.connectingRevenue, 0),
  };
}
