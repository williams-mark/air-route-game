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
  /** Part of `passengersOneWay` added by the connecting floor (`CONNECTING_FLOOR`); absent when the choice model alone met it. */
  floorOneWay?: number;
  /** One-way weekly local passengers who gave up a seat to floor connecting passengers on a full flight; absent when none. */
  displacedOneWay?: number;
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

/**
 * Network-wide cut: the largest `maxMarkets` through markets with at least `minWeeklyDemand` are evaluated each day. Each route's own
 * largest markets are evaluated as well (`CONNECTING_FLOOR.guaranteedMarketsPerRoute`), so stepDay stays O(routes).
 */
export const NETWORK_LIMITS = { maxMarkets: 12, minWeeklyDemand: 300 } as const;

/**
 * Connecting floor: a route with a sensible onward connection never reports exactly 0 connecting passengers.
 * A connection is sensible when it does not double back: flown distance <= `maxCircuity` x the direct distance (HNL-OGG via LAX
 * is not; MRY-SAN via LAX is). Only sensible connections count below.
 * 1. Each route's `guaranteedMarketsPerRoute` largest through markets are always evaluated with the choice model, whatever the
 *    network-wide `NETWORK_LIMITS` cut (which used to drop every market of a small spoke once the network had 12 larger ones).
 * 2. If the route still carries fewer one-way connecting passengers than
 *    max(minPassengersOneWay, min(maxShare, sharePerOnwardRoute x onward cities) x local one-way passengers),
 *    capped at `maxShareOfOnwardDemand` of the onward markets' demand, the shortfall is added on its largest onward markets at the
 *    through fare. Free seats are used first; on a full flight the floor passengers take seats from local passengers.
 * Calibration (MODEL.md 9b): the lowest connecting shares at large US airports are 10-13% of boardings (SAN, SFO, LAX; DOT/BTS O&D
 * survey), so the 1% cap is a tenth of the lowest observed share: a minimum, not a target. The 0.2% per onward city slope, the
 * 2-passenger minimum and the circuity limit are assumptions.
 */
export const CONNECTING_FLOOR = {
  guaranteedMarketsPerRoute: 2, sharePerOnwardRoute: 0.002, maxShare: 0.01, minPassengersOneWay: 2, maxShareOfOnwardDemand: 0.25, maxCircuity: 2,
} as const;

/** True when flying a-hub-b does not double back (see `CONNECTING_FLOOR.maxCircuity`). */
export function isSensibleConnection(a: Airport, hub: Airport, b: Airport): boolean {
  return distanceKm(a, hub) + distanceKm(hub, b) <= CONNECTING_FLOOR.maxCircuity * distanceKm(a, b);
}

/**
 * Whether passengers can connect on a route, from the route list alone (the same rules `evaluateNetwork` uses):
 * "none" = no other route of the player's meets it at either end; "all_nonstop" = other routes meet it, but the player already
 * flies nonstop to every city they reach; "backtrack_only" = the only through markets double back; "available" = at least one
 * sensible through market exists, so the route carries connecting passengers whenever it and the onward route are flying.
 */
export type OnwardStatus = "none" | "all_nonstop" | "backtrack_only" | "available";
export function onwardConnectionStatus(
  route: Pick<Route, "id" | "origin" | "destination">, routes: readonly Pick<Route, "id" | "origin" | "destination">[], airports: ReadonlyMap<string, Airport>,
): OnwardStatus {
  const direct = new Set(routes.map((r) => (r.origin < r.destination ? `${r.origin}|${r.destination}` : `${r.destination}|${r.origin}`)));
  let meets = false, market = false;
  for (const [hubId, farId] of [[route.origin, route.destination], [route.destination, route.origin]] as const) {
    for (const o of routes) {
      if (o.id === route.id || (o.origin !== hubId && o.destination !== hubId)) continue;
      const otherId = o.origin === hubId ? o.destination : o.origin;
      if (otherId === farId) continue;
      meets = true;
      if (direct.has(farId < otherId ? `${farId}|${otherId}` : `${otherId}|${farId}`)) continue;
      const far = airports.get(farId), hub = airports.get(hubId), other = airports.get(otherId);
      if (!far || !hub || !other) continue;
      market = true;
      if (isSensibleConnection(far, hub, other)) return "available";
    }
  }
  return market ? "backtrack_only" : meets ? "all_nonstop" : "none";
}

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
  // Network-wide cut (largest markets), plus every route's own largest markets so a small spoke is never left out.
  const chosen = new Set<Cand>();
  for (const c of cands.slice(0, NETWORK_LIMITS.maxMarkets)) if (c.weekly >= NETWORK_LIMITS.minWeeklyDemand) chosen.add(c);
  const byRoute = new Map<Id, Cand[]>();
  for (const c of cands) {
    if (!isSensibleConnection(c.a, c.hub, c.b)) continue;
    for (const r of [c.r1, c.r2]) byRoute.set(r.id, [...(byRoute.get(r.id) ?? []), c]);
  }
  for (const list of byRoute.values()) for (const c of list.slice(0, CONNECTING_FLOOR.guaranteedMarketsPerRoute)) chosen.add(c);

  const reserved: Record<Id, number> = {};
  const acc: Record<Id, RouteConnecting> = {};
  const reports = new Map<Cand, ConnectingMarketReport>();
  const markdownOf = (c: Cand) => ((input.connectionMarkdown?.[c.r1.id] ?? 0) + (input.connectionMarkdown?.[c.r2.id] ?? 0)) / 2;
  const accOf = (id: Id) => (acc[id] ??= { passengersOneWay: 0, revenue: 0, cost: 0, markets: [] });
  for (const c of cands) {
    if (!chosen.has(c)) continue;
    const md = markdownOf(c);
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
    reports.set(c, marketReport);
    contrib.legs.forEach((leg, k) => {
      const route = k === 0 ? c.r1 : c.r2;
      reserved[route.id] = (reserved[route.id] ?? 0) + conn.connectingPassengers;
      const cur = accOf(route.id);
      cur.passengersOneWay += conn.connectingPassengers;
      cur.revenue += leg.connectingRevenue;
      cur.markets.push(marketReport);
    });
  }

  // Connecting floor (see CONNECTING_FLOOR): top up any route that has an onward connection but carries fewer than the floor.
  const F = CONNECTING_FLOOR;
  const localOneWay = (id: Id) => input.weeks[id]!.evaluation.passengersPerWeek / 2;
  /** One-way seats still open to connecting passengers on a leg: all seats less the connecting passengers already aboard. */
  const roomFor = (id: Id) => Math.max(0, input.weeks[id]!.evaluation.seatsPerWeek / 2 - (acc[id]?.passengersOneWay ?? 0));
  for (const r of routes) {
    const list = byRoute.get(r.id);
    if (!list) continue;
    const onward = new Set(list.map((c) => (c.r1.id === r.id ? c.b.id : c.a.id))).size;
    const floor = Math.min(
      Math.max(F.minPassengersOneWay, Math.min(F.maxShare, F.sharePerOnwardRoute * onward) * localOneWay(r.id)),
      F.maxShareOfOnwardDemand * list.reduce((s, c) => s + c.weekly, 0),
    );
    let need = floor - (acc[r.id]?.passengersOneWay ?? 0);
    for (const c of list) {
      if (need <= 1e-9) break;
      const x = Math.min(need, roomFor(c.r1.id), roomFor(c.r2.id));
      if (x <= 1e-9) continue;
      need -= x;
      const fare = benchmarkFareFor(c.a, c.b) * THROUGH_FARE_FACTOR * (1 - markdownOf(c));
      const through = 2 * x * fare;
      const d1 = distanceKm(c.a, c.hub), d2 = distanceKm(c.hub, c.b);
      let rep = reports.get(c);
      if (rep) {
        rep.share *= (rep.passengersOneWay + x) / rep.passengersOneWay;
        rep.passengersOneWay += x;
        rep.revenue += through;
      } else {
        rep = { origin: c.a.id, hub: c.hub.id, destination: c.b.id, passengersOneWay: x, throughFare: fare, revenue: through, share: c.weekly > 0 ? Math.min(1, x / c.weekly) : 0 };
        reports.set(c, rep);
        accOf(c.r1.id).markets.push(rep);
        accOf(c.r2.id).markets.push(rep);
      }
      [c.r1, c.r2].forEach((leg, k) => {
        const cur = accOf(leg.id);
        const free = Math.max(0, input.weeks[leg.id]!.evaluation.seatsPerWeek / 2 - (localOneWay(leg.id) - (cur.displacedOneWay ?? 0)) - cur.passengersOneWay);
        if (x > free + 1e-9) cur.displacedOneWay = (cur.displacedOneWay ?? 0) + (x - free);
        cur.passengersOneWay += x;
        cur.floorOneWay = (cur.floorOneWay ?? 0) + x;
        cur.revenue += (through * (k === 0 ? d1 : d2)) / (d1 + d2);
      });
    }
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
    // Local passengers displaced by floor connecting passengers on a full flight, and the local revenue that goes with them.
    const displaced = cr.displacedOneWay ?? 0;
    const lostLocal = 2 * displaced * base.revenuePerPassenger;
    const re = evaluateWithFleet({
      route, a, b, requested: type, groups: fleetGroups(type, fleet ?? [], types, input.flights?.[routeId]), day,
      weeklyPassengers: base.passengersPerWeek + 2 * (cr.passengersOneWay - displaced),
      operatedFraction: fraction, ownership: !fleet || fleet.length === 0 ? "fractional" : "excluded",
      serviceLevels: input.serviceLevels,
    });
    const extraCost = Math.max(0, re.costs - base.costs - rate * (re.revenue - base.revenue) + rate * (cr.revenue - lostLocal));
    cr.cost = extraCost;
    const lines: LedgerLine[] = [
      ...base.lines,
      {
        key: "connecting", label: "Connecting passengers (prorated through fares)", group: "revenue", weekly: cr.revenue,
        formula: `${cr.markets.map((m) => `${m.origin}-${m.destination} via ${m.hub}: ${Math.round(m.passengersOneWay)}/wk each way at $${Math.round(m.throughFare)}`).join("; ")}; fare prorated by distance`,
      },
      {
        key: "connectingCost", label: "Cost of carrying connecting passengers", group: "cost", weekly: extraCost,
        formula: `ledger re-run with ${Math.round(2 * (cr.passengersOneWay - displaced))} extra pax/wk (fuel burn, pax services, sales and overhead on through revenue)`,
      },
    ];
    if (displaced > 0) {
      lines.push({
        key: "connectingDisplaced", label: "Local fares given up for connecting passengers", group: "revenue", weekly: -lostLocal,
        formula: `${Math.round(2 * displaced)} local pax/wk gave up seats on a full flight at $${Math.round(base.revenuePerPassenger)} each`,
      });
    }
    const revenue = base.revenue - lostLocal + cr.revenue;
    const costs = base.costs + extraCost;
    const profit = revenue - costs;
    const pax = base.passengersPerWeek + 2 * (cr.passengersOneWay - displaced);
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
    out.deltaRevenue += cr.revenue - lostLocal;
    out.deltaCosts += extraCost;
  }
  out.connecting = acc;
  return out;
}
