import type { Aircraft, AircraftType, Airport, CabinClass, Day, Fares, MarketSnapshot, Route } from "@arg/contracts";
import {
  benchmarkFare,
  DEFAULT_CHOICE_PARAMS,
  runChoice,
  type ChoiceParams,
  type ChoiceResult,
  type Itinerary,
  type Leg,
} from "../demand/choice";
import { marketOnDay, SEGMENTS, segmentMap, type DayMarket, type MarketParams, DEFAULT_MARKET_PARAMS } from "../demand/market";
import { distanceKm } from "../geo";
import {
  aircraftEquivalentFor,
  blockHours,
  evaluateRoute,
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
  rivalMarketCoverage: 0.6,
  rivalCountBands: [[1500, 1], [6000, 2], [Infinity, 3]],
  rivalProfiles: [
    { seatShare: 0.45, fareFactor: 1.0, quality: 0.55 },
    { seatShare: 0.33, fareFactor: 0.96, quality: 0.5 },
    { seatShare: 0.22, fareFactor: 1.05, quality: 0.45 },
  ],
};

export function cabinsFor(route: Pick<Route, "fares">, type: AircraftType, aircraft: Aircraft | undefined): CabinInput[] {
  const fareFor = (cls: CabinClass, fares: Fares) => fares[cls] ?? fares.Y * PREMIUM_FARE_MULTIPLIER[cls];
  if (aircraft) {
    const bySection = new Map<CabinClass, number>();
    for (const s of aircraft.layout.sections) {
      bySection.set(s.cls, (bySection.get(s.cls) ?? 0) + s.rows * s.seatsAcross);
    }
    const out: CabinInput[] = [];
    for (const cls of ["F", "J", "W", "Y"] as const) {
      const seats = bySection.get(cls);
      if (seats) out.push({ cls, seats, fare: fareFor(cls, route.fares) });
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
      cabins.push({ cls, seats, fare: fareFor(cls, f) });
      used += seats;
    }
  }
  cabins.push({ cls: "Y", seats: total - used, fare: f.Y });
  return cabins;
}

function makeLeg(id: string, o: string, d: string, dist: number, speedKmh: number, freq: number, seats: number): Leg {
  return {
    id, origin: o, destination: d, distanceKm: dist,
    blockMin: ((dist * 1.04) / (speedKmh * 0.93) + 0.5) * 60,
    weeklyFrequency: freq, weeklySeats: freq * seats,
  };
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
}

export interface RouteWeekOptions {
  config?: RouteModelConfig;
  /** Fleet aircraft of the route's type (first provides the cabin layout). */
  fleetAircraft?: Aircraft[];
  /** Multiplier on all demand (noise, events). */
  demandScale?: number;
  /** Fraction of frequency that fleet capacity allows (computed across routes by the caller). */
  operatedFraction?: number;
  /** Charge ownership via the ledger. Default: true when no fleet aircraft are supplied. */
  chargeOwnership?: boolean;
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
  const cabins = cabinsFor(route, type, fleet[0]);
  const seatsPerFlight = cabins.reduce((s, c) => s + c.seats, 0);
  const dist = distanceKm(a, b);
  const fraction = Math.max(0, Math.min(1, opts.operatedFraction ?? 1));
  const demandScale = opts.demandScale ?? 1;

  const market = marketOnDay(a, b, day, cfg.market);
  const demand = segmentMap((s) => market.bySegment[s] * demandScale);

  // Player itinerary: only if the type can actually fly the pair (else evaluation is infeasible anyway).
  const feasibleProbe = evaluateRoute({
    origin: a, destination: b, aircraft: type, day, weeklyFrequency: route.weeklyFrequency, cabins,
    weeklyPassengers: 0, ownership: "excluded",
  });
  const flownFreq = feasibleProbe.feasible ? route.weeklyFrequency * fraction : 0;
  const player: Itinerary = {
    id: `player:${route.id}`,
    carrier: "player",
    legs: [makeLeg(`player:${route.id}`, a.id, b.id, dist, type.cruiseKmh, flownFreq, seatsPerFlight)],
    fare: route.fares.Y,
    quality: 0.5,
    marketDistanceKm: dist,
  };

  // Synthetic rest-of-market: 1-3 direct rivals sized to the annual-average market, plus a one-stop rival.
  const rivalSeats = dist > 3000 ? 250 : dist > 1200 ? 180 : dist < 400 && market.baseWeekly < 6000 ? 90 : 140;
  const nRivals = (cfg.rivalCountBands.find(([upTo]) => market.baseWeekly <= upTo) ?? cfg.rivalCountBands[cfg.rivalCountBands.length - 1]!)[1];
  const profiles = cfg.rivalProfiles.slice(0, nRivals);
  const profileTotal = profiles.reduce((s, r) => s + r.seatShare, 0);
  const totalRivalSeats = (market.baseWeekly * cfg.rivalMarketCoverage) / cfg.rivalTargetLoadFactor;
  const benchFare = benchmarkFare(dist) * cfg.rivalFareFactor;
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

  const choice = runChoice({
    demand,
    itineraries: [player, ...rivals],
    outside: { distanceKm: dist, driveAvailable: a.region === "CA" && b.region === "CA" },
    params: cfg.choice,
  });
  const mine = choice.itineraries[0]!;
  const evaluation = evaluateRoute({
    origin: a, destination: b, aircraft: type, day, weeklyFrequency: route.weeklyFrequency, cabins,
    weeklyPassengers: 2 * mine.passengers,
    operatedFraction: fraction,
    ownership: (opts.chargeOwnership ?? fleet.length === 0) ? "fractional" : "excluded",
  });

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
  return { route, day, market, choice, evaluation, playerPassengersOneWay: mine.passengers, snapshot, operatedFraction: fraction };
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
