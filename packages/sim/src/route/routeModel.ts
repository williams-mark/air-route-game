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
import { rivalSizingMarket } from "./rivalSizing";
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

export function cabinsFor(route: Pick<Route, "fares">, type: AircraftType, aircraft: Aircraft | undefined, distKm?: number): CabinInput[] {
  const pf = distKm === undefined ? 1 : premiumDistanceFactor(distKm);
  const going = (cls: CabinClass) => (cls === "Y" ? 1 : PREMIUM_FARE_MULTIPLIER[cls] * pf);
  const fareFor = (cls: CabinClass, fares: Fares) => fares[cls] ?? fares.Y * going(cls);
  /** Premium cabins priced above the going multiple of economy fill less: weight (going / actual)^2, so revenue falls as 1/multiple. */
  const fillScale = (cls: CabinClass, fares: Fares) => {
    if (cls === "Y") return 1;
    const mult = fareFor(cls, fares) / Math.max(1e-9, fares.Y);
    return mult > going(cls) ? (going(cls) / mult) ** 2 : 1;
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
  /** Modelled rival itineraries for this pair (rivals lane). When non-empty they replace the synthetic direct rivals; the synthetic one-stop stays. */
  rivalItineraries?: Itinerary[];
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
  const cabins = cabinsFor(route, type, fleet[0], dist);
  const seatsPerFlight = cabins.reduce((s, c) => s + c.seats, 0);
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

  const synthetic = buildRivals(a, b, dist, rivalSizingMarket(a, b, dist, market, demand, cfg.choice, (m) => buildRivals(a, b, dist, m, cfg)), cfg);
  const rivals = opts.rivalItineraries && opts.rivalItineraries.length > 0
    ? [...opts.rivalItineraries, ...synthetic.filter((i) => i.id.startsWith("conn:"))]
    : synthetic;

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

  const opts = (fleet: Aircraft[] | undefined, frac: number): RouteWeekOptions => ({
    config: cfg, fleetAircraft: fleet, operatedFraction: frac, demandScale, chargeOwnership: !fleet || fleet.length === 0,
  });
  const w1 = input.week1 ?? simulateRouteWeek(leg1, airports, types, day, opts(input.fleet1, f1));
  const w2 = input.week2 ?? simulateRouteWeek(leg2, airports, types, day, opts(input.fleet2, f2));
  if (!w1 || !w2) return null;

  const cab1 = cabinsFor(leg1, t1, input.fleet1?.[0], distanceKm(a, h));
  const cab2 = cabinsFor(leg2, t2, input.fleet2?.[0], distanceKm(h, b));
  const seats1 = leg1.weeklyFrequency * f1 * cab1.reduce((s, c) => s + c.seats, 0);
  const seats2 = leg2.weeklyFrequency * f2 * cab2.reduce((s, c) => s + c.seats, 0);
  const left1 = Math.max(0, seats1 - w1.playerPassengersOneWay - (input.reservedSeats1 ?? 0));
  const left2 = Math.max(0, seats2 - w2.playerPassengersOneWay - (input.reservedSeats2 ?? 0));
  const d1 = distanceKm(a, h);
  const d2 = distanceKm(h, b);
  const dist = distanceKm(a, b);
  const speed = (t: AircraftType) => t.cruiseKmh;

  const market = marketOnDay(a, b, day, cfg.market);
  const demand = segmentMap((s) => market.bySegment[s] * demandScale);
  const throughFare = input.connectingFare ?? benchmarkFare(dist) * 0.92;
  const mk = (id: string, o: string, d: string, dd: number, t: AircraftType, route: Route, frac: number, seats: number): Leg => ({
    ...makeLeg(id, o, d, dd, speed(t), route.weeklyFrequency * frac, 1),
    weeklySeats: seats,
  });
  const player: Itinerary = {
    id: `player:${a.id}-${h.id}-${b.id}`,
    carrier: "player",
    fare: throughFare,
    quality: 0.5,
    marketDistanceKm: dist,
    legs: [
      mk(`player:${leg1.id}`, a.id, h.id, d1, t1, leg1, f1, left1),
      mk(`player:${leg2.id}`, h.id, b.id, d2, t2, leg2, f2, left2),
    ],
  };
  const rivals = buildRivals(a, b, dist, rivalSizingMarket(a, b, dist, market, demand, cfg.choice, (m) => buildRivals(a, b, dist, m, cfg)), cfg);
  const choice = runChoice({
    demand,
    itineraries: [player, ...rivals],
    outside: { distanceKm: dist, driveAvailable: a.region === "CA" && b.region === "CA" },
    params: cfg.choice,
  });
  const c = choice.itineraries[0]!.passengers;

  const share1 = d1 / (d1 + d2);
  const cost = (w: RouteWeek, route: Route, type: AircraftType, cabins: CabinInput[], fleet: Aircraft[] | undefined, frac: number, pax: number) =>
    evaluateRoute({
      origin: airports.get(route.origin)!, destination: airports.get(route.destination)!, aircraft: type, day,
      weeklyFrequency: route.weeklyFrequency, cabins, weeklyPassengers: 2 * pax, operatedFraction: frac,
      ownership: !fleet || fleet.length === 0 ? "fractional" : "excluded",
    }).costs;
  const mkLeg = (w: RouteWeek, route: Route, type: AircraftType, cabins: CabinInput[], fleet: Aircraft[] | undefined, frac: number, seats: number, share: number): HubLegLoad => {
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
    legs: [mkLeg(w1, leg1, t1, cab1, input.fleet1, f1, seats1, share1), mkLeg(w2, leg2, t2, cab2, input.fleet2, f2, seats2, 1 - share1)],
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
