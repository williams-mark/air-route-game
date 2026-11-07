import type { Aircraft, AircraftType, Airport, CabinClass, Day, Id, Route, ServiceLevel } from "@arg/contracts";
import { marketOnDay } from "../demand/market";
import { benchmarkFareFor } from "../demand/fares";
import { distanceKm } from "../geo";
import { evaluateRoute, LEDGER_PARAMS, type CabinLoad, type LedgerLine, type RouteEvaluation } from "../finance/ledger";
import {
  DEFAULT_ROUTE_MODEL_CONFIG, evaluateWithFleet, fleetGroups, evaluateHubConnection, networkContribution, type RouteWeek,
} from "./routeModel";

/** One through market served by two of the player's routes (e.g. SAN-HNL via LAX). Weekly figures. */
export interface ConnectingMarketReport {
  origin: Id;
  hub: Id;
  destination: Id;
  /** Through passengers per week in one direction. */
  passengersOneWay: number;
  throughFare: number;
  /** Through revenue, both directions, before proration. */
  revenue: number;
  /** Player's share of the through market's captured passengers. */
  share: number;
}

/** Connecting traffic added to one route (weekly, both directions where stated). */
export interface RouteConnecting {
  /** One-way weekly through passengers riding this route. */
  passengersOneWay: number;
  /** Prorated through-fare revenue booked to this route, both directions. */
  revenue: number;
  /** Extra variable cost of carrying them, both directions. */
  cost: number;
  markets: ConnectingMarketReport[];
}

export interface NetworkInput {
  routes: readonly Route[];
  airports: ReadonlyMap<string, Airport>;
  types: ReadonlyMap<string, AircraftType>;
  day: Day;
  /** Local weekly results per route id (from `simulateRouteWeek`). Routes without one are ignored. */
  weeks: Readonly<Record<Id, RouteWeek | undefined>>;
  /** Aircraft flying each route (first provides the cabin layout); empty/undefined for a notional fleet. */
  fleet: Readonly<Record<Id, Aircraft[] | undefined>>;
  /** Round trips per week each aircraft flies on each route (route id, then aircraft id); weights mixed fleets. Optional. */
  flights?: Readonly<Record<Id, Readonly<Record<Id, number>> | undefined>>;
  operatedFraction: Readonly<Record<Id, number | undefined>>;
  /**
   * Fare-policy connection markdown (0..0.5) per route id. A through itinerary uses the mean of its two legs' markdowns: its fare is
   * the default through fare x (1 - markdown), so revenue per passenger falls by the markdown and the choice model's price elasticity
   * moves some demand to the cheaper itinerary. Absent or 0 = unchanged behaviour.
   */
  connectionMarkdown?: Readonly<Record<Id, number | undefined>>;
  /** The airline's service level per cabin (absent = standard); passed to every cabin-dependent evaluation. */
  serviceLevels?: Readonly<Partial<Record<CabinClass, ServiceLevel>>>;
}

export interface NetworkResult {
  /** Adjusted evaluation per route that carries connecting traffic (others are absent). */
  evaluations: Record<Id, RouteEvaluation>;
  connecting: Record<Id, RouteConnecting>;
  /** Change in weekly revenue and costs across the network. */
  deltaRevenue: number;
  deltaCosts: number;
}

/** At most this many through markets are evaluated per day (largest first); smaller ones are ignored. Keeps stepDay O(routes). */
export const NETWORK_LIMITS = { maxMarkets: 12, minWeeklyDemand: 300 } as const;

/** Default through fare as a share of the benchmark fare (same constant as evaluateHubConnection). */
const THROUGH_FARE_FACTOR = 0.92;
const P = LEDGER_PARAMS;
const empty = (): NetworkResult => ({ evaluations: {}, connecting: {}, deltaRevenue: 0, deltaCosts: 0 });

/**
 * Connecting passengers added to a route's cabins. They are spread over the cabins in proportion to the empty seats each has, so
 * per-cabin load adds up to the route total (the through traffic's own cabin mix is not modelled). Absent when the route has no
 * per-cabin figures.
 */
export function addConnectingToCabins(loads: readonly CabinLoad[] | undefined, extra: number): CabinLoad[] | undefined {
  if (!loads) return undefined;
  const room = loads.reduce((s, c) => s + Math.max(0, c.seatsPerWeek - c.passengersPerWeek), 0);
  if (room <= 0 || extra <= 0) return loads.map((c) => ({ ...c }));
  const add = Math.min(extra, room);
  return loads.map((c) => ({ ...c, passengersPerWeek: c.passengersPerWeek + (add * Math.max(0, c.seatsPerWeek - c.passengersPerWeek)) / room }));
}

/**
 * Connecting passengers for every hub market where the player offers both legs but no direct service (SAN-HNL via LAX,
 * SMF-HNL via LAX or SFO, SFO-OGG via LAX ...).
 *
 * A hub is an airport on two or more player routes. For each pair of spoke routes whose far ends differ and have no player
 * route between them, `evaluateHubConnection` is run with the already simulated local weeks. Local passengers keep their
 * seats; markets are served largest first, and each takes seats from the legs' leftovers, so a leg's seats are never sold
 * twice. Through fares are prorated to the legs by distance (`networkContribution`, the proration check holds), and the
 * legs' ledgers are re-evaluated with the extra passengers aboard: the incremental cost is the ledger cost difference with
 * the revenue-linked lines (distribution, overhead) recomputed on the through revenue instead of the leg fares.
 */
export function evaluateNetwork(input: NetworkInput): NetworkResult {
  const { routes, airports, types, day } = input;
  const out = empty();
  const direct = new Set<string>();
  for (const r of routes) direct.add(r.origin < r.destination ? `${r.origin}|${r.destination}` : `${r.destination}|${r.origin}`);
  const byAirport = new Map<string, Route[]>();
  for (const r of routes) {
    const w = input.weeks[r.id];
    if (!w || !w.evaluation.feasible || w.evaluation.flightsPerWeek <= 0) continue;
    for (const id of [r.origin, r.destination]) byAirport.set(id, [...(byAirport.get(id) ?? []), r]);
  }

  interface Cand { hub: Airport; r1: Route; r2: Route; a: Airport; b: Airport; weekly: number }
  const cands: Cand[] = [];
  const cfg = DEFAULT_ROUTE_MODEL_CONFIG;
  for (const [hubId, rs] of byAirport) {
    if (rs.length < 2) continue;
    const hub = airports.get(hubId);
    if (!hub) continue;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const r1 = rs[i]!, r2 = rs[j]!;
        const aId = r1.origin === hubId ? r1.destination : r1.origin;
        const bId = r2.origin === hubId ? r2.destination : r2.origin;
        if (aId === bId) continue;
        const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
        if (direct.has(key)) continue;
        const a = airports.get(aId), b = airports.get(bId);
        if (!a || !b) continue;
        cands.push({ hub, r1, r2, a, b, weekly: marketOnDay(a, b, day, cfg.market).weekly });
      }
    }
  }
  if (cands.length === 0) return out;
  cands.sort((x, y) => y.weekly - x.weekly || (x.r1.id + x.r2.id < y.r1.id + y.r2.id ? -1 : 1));
  cands.splice(NETWORK_LIMITS.maxMarkets);
  while (cands.length > 0 && cands[cands.length - 1]!.weekly < NETWORK_LIMITS.minWeeklyDemand) cands.pop();

  const reserved: Record<Id, number> = {};
  const acc: Record<Id, RouteConnecting> = {};
  for (const c of cands) {
    const md = ((input.connectionMarkdown?.[c.r1.id] ?? 0) + (input.connectionMarkdown?.[c.r2.id] ?? 0)) / 2;
    const conn = evaluateHubConnection({
      connectingFare: md > 0 ? benchmarkFareFor(c.a, c.b) * THROUGH_FARE_FACTOR * (1 - md) : undefined,
      origin: c.a, hub: c.hub, destination: c.b, leg1: c.r1, leg2: c.r2, types, day,
      fleet1: input.fleet[c.r1.id], fleet2: input.fleet[c.r2.id],
      flights1: input.flights?.[c.r1.id], flights2: input.flights?.[c.r2.id],
      operatedFraction1: input.operatedFraction[c.r1.id] ?? 1, operatedFraction2: input.operatedFraction[c.r2.id] ?? 1,
      week1: input.weeks[c.r1.id], week2: input.weeks[c.r2.id],
      reservedSeats1: reserved[c.r1.id] ?? 0, reservedSeats2: reserved[c.r2.id] ?? 0,
      serviceLevels: input.serviceLevels,
    });
    if (!conn || conn.connectingPassengers < 0.5) continue;
    const contrib = networkContribution(conn);
    const marketReport: ConnectingMarketReport = {
      origin: c.a.id, hub: c.hub.id, destination: c.b.id, passengersOneWay: conn.connectingPassengers,
      throughFare: conn.throughFare, revenue: contrib.throughRevenue, share: conn.snapshot.playerShare,
    };
    contrib.legs.forEach((leg, k) => {
      const route = k === 0 ? c.r1 : c.r2;
      reserved[route.id] = (reserved[route.id] ?? 0) + conn.connectingPassengers;
      const cur = acc[route.id] ?? { passengersOneWay: 0, revenue: 0, cost: 0, markets: [] };
      cur.passengersOneWay += conn.connectingPassengers;
      cur.revenue += leg.connectingRevenue;
      cur.markets.push(marketReport);
      acc[route.id] = cur;
    });
  }

  const rate = P.distributionShareOfRevenue + P.generalOverheadShareOfRevenue;
  for (const [routeId, cr] of Object.entries(acc)) {
    const route = routes.find((r) => r.id === routeId)!;
    const week = input.weeks[routeId]!;
    const base = week.evaluation;
    const type = types.get(route.typeId)!;
    const a = airports.get(route.origin)!, b = airports.get(route.destination)!;
    const fleet = input.fleet[routeId];
    const fraction = input.operatedFraction[routeId] ?? 1;
    const re = evaluateWithFleet({
      route, a, b, requested: type, groups: fleetGroups(type, fleet ?? [], types, input.flights?.[routeId]), day,
      weeklyPassengers: base.passengersPerWeek + 2 * cr.passengersOneWay,
      operatedFraction: fraction, ownership: !fleet || fleet.length === 0 ? "fractional" : "excluded",
      serviceLevels: input.serviceLevels,
    });
    const extraCost = Math.max(0, re.costs - base.costs - rate * (re.revenue - base.revenue) + rate * cr.revenue);
    cr.cost = extraCost;
    const lines: LedgerLine[] = [
      ...base.lines,
      {
        key: "connecting", label: "Connecting passengers (prorated through fares)", group: "revenue", weekly: cr.revenue,
        formula: `${cr.markets.map((m) => `${m.origin}-${m.destination} via ${m.hub}: ${Math.round(m.passengersOneWay)}/wk each way at $${Math.round(m.throughFare)}`).join("; ")}; fare prorated by distance`,
      },
      {
        key: "connectingCost", label: "Cost of carrying connecting passengers", group: "cost", weekly: extraCost,
        formula: `ledger re-run with ${Math.round(2 * cr.passengersOneWay)} extra pax/wk (fuel burn, pax services, sales and overhead on through revenue)`,
      },
    ];
    const revenue = base.revenue + cr.revenue;
    const costs = base.costs + extraCost;
    const profit = revenue - costs;
    const pax = base.passengersPerWeek + 2 * cr.passengersOneWay;
    const lf = base.seatsPerWeek > 0 ? Math.min(1, pax / base.seatsPerWeek) : 0;
    out.evaluations[routeId] = {
      ...base,
      lines,
      passengersPerWeek: pax,
      cabinLoads: addConnectingToCabins(base.cabinLoads, 2 * cr.passengersOneWay),
      loadFactor: lf,
      revenue,
      costs,
      profit,
      margin: revenue > 0 ? profit / revenue : costs > 0 ? -1 : 0,
      revenuePerPassenger: pax > 0 ? revenue / pax : 0,
      costPerPassenger: pax > 0 ? costs / pax : 0,
      breakEvenLoadFactor: revenue > 0 && lf > 0 ? Math.min(2, (costs / revenue) * lf) : null,
    };
    out.deltaRevenue += cr.revenue;
    out.deltaCosts += extraCost;
  }
  out.connecting = acc;
  return out;
}
