// Pure rows for the Hub board view. No React, no sim calls: the caller supplies reports and block-hour figures.
import type { Route } from "@arg/contracts";
import { connectingShare as sharedConnectingShare, loadByCabin, type CabinLoadFactor, type RouteReport } from "@arg/sim";
import type { FleetItem } from "../sim/bridge";

export interface BoardRow {
  routeId: string;
  /** "dep" when the route starts at the hub, "arr" when it ends there. */
  direction: "dep" | "arr";
  /** The airport at the other end. */
  other: string;
  typeId: string;
  /** Weekly round trips: scheduled when the sim reports it, else requested. */
  frequency: number;
  requested: number;
  /** Null when the route has no sim report yet. */
  loadFactor: number | null;
  weeklyProfit: number | null;
  /** Share of the route's passengers that are connecting (0..1); null when there is no report. */
  connectingShare: number | null;
  /** Connecting passengers a week on the route, both directions; null when there is no report. */
  connectingPassengers: number | null;
  /** Load of each cabin the route flies, empty cabins at 0%; empty when there is no report. */
  byCabin: CabinLoadFactor[];
}

type Reports = Readonly<Record<string, RouteReport | undefined>>;

/** Connecting passengers (one-way weekly figure, carried both ways) as a share of all weekly passengers, clamped to 0..1. */
export function connectingShare(oneWay: number, passengersPerWeek: number): number {
  return sharedConnectingShare(oneWay, passengersPerWeek);
}

/** Cabins a route flies, with their load (sim figures; an empty cabin is 0%). */
export function cabinLoadsOf(ev: Parameters<typeof loadByCabin>[0]): CabinLoadFactor[] {
  const all = loadByCabin(ev);
  return (["F", "J", "W", "Y"] as const).map((c) => all[c]).filter((c) => c.seatsPerWeek > 0);
}

/** Routes touching the hub, departures (origin = hub) first, then by weekly profit (unknown last), then by other airport. */
export function buildBoardRows(routes: readonly Route[], reports: Reports, hub: string): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const r of routes) {
    if (r.origin !== hub && r.destination !== hub) continue;
    const rep = reports[r.id];
    const ev = rep?.evaluation;
    rows.push({
      routeId: r.id,
      direction: r.origin === hub ? "dep" : "arr",
      other: r.origin === hub ? r.destination : r.origin,
      typeId: r.typeId,
      frequency: rep?.scheduling?.scheduledFrequency ?? r.weeklyFrequency,
      requested: r.weeklyFrequency,
      loadFactor: ev ? ev.loadFactor : null,
      weeklyProfit: ev ? ev.profit : null,
      connectingShare: ev ? connectingShare(rep?.connecting?.passengersOneWay ?? 0, ev.passengersPerWeek) : null,
      connectingPassengers: ev ? 2 * (rep?.connecting?.passengersOneWay ?? 0) : null,
      byCabin: ev ? cabinLoadsOf(ev) : [],
    });
  }
  return rows.sort((a, b) =>
    (a.direction === b.direction ? 0 : a.direction === "dep" ? -1 : 1)
    || (b.weeklyProfit ?? -Infinity) - (a.weeklyProfit ?? -Infinity)
    || a.other.localeCompare(b.other, "en"));
}

export interface HubSummary {
  routes: number;
  weeklyProfit: number;
  /** Routes without a report are left out of the sums. */
  unreported: number;
  /** Connecting passengers per week over all board routes, both ways; null when no route has a report. */
  connectingPassengers: number | null;
  /** Share of board passengers that connect; null when there is no passenger figure. */
  connectingShare: number | null;
}

export function summarizeBoard(routes: readonly Route[], reports: Reports, hub: string): HubSummary {
  let n = 0, profit = 0, unreported = 0, conn = 0, pax = 0, any = false;
  for (const r of routes) {
    if (r.origin !== hub && r.destination !== hub) continue;
    n++;
    const rep = reports[r.id];
    if (!rep) { unreported++; continue; }
    any = true;
    profit += rep.evaluation.profit;
    pax += rep.evaluation.passengersPerWeek;
    conn += 2 * (rep.connecting?.passengersOneWay ?? 0);
  }
  return {
    routes: n, weeklyProfit: profit, unreported,
    connectingPassengers: any ? conn : null,
    connectingShare: any && pax > 0 ? Math.min(1, conn / pax) : null,
  };
}

export interface HubTypeHours { typeId: string; used: number; available: number; free: number; usedShare: number }

/** Types to list for a hub: those of aircraft based there (active) plus those of routes leaving it. Sorted by id. */
export function hubTypeIds(fleet: readonly Pick<FleetItem, "typeId" | "status" | "hub">[], routes: readonly Route[], hub: string, home?: string): string[] {
  const ids = new Set<string>();
  for (const a of fleet) if (a.status === "active" && (a.hub ?? home) === hub) ids.add(a.typeId);
  for (const r of routes) if (r.origin === hub) ids.add(r.typeId);
  return [...ids].sort((x, y) => x.localeCompare(y, "en"));
}

/** Block-hour rows per type; `usedShare` is used / available (0 with nothing used; capped at 2 for drawing, also when nothing is available). */
export function buildHourRows(typeIds: readonly string[], hoursFor: (typeId: string) => { available: number; used: number; free: number }): HubTypeHours[] {
  return typeIds.map((typeId) => {
    const h = hoursFor(typeId);
    return { typeId, used: h.used, available: h.available, free: h.free, usedShare: h.available > 0 ? Math.min(2, h.used / h.available) : h.used > 0 ? 2 : 0 };
  });
}

/** Hubs to offer: the player's owned hubs (`playerHubs` in the sim), home first, then A-Z. */
export function boardHubOptions(hubs: readonly string[], home?: string): string[] {
  const set = new Set(hubs);
  if (home) set.add(home);
  return [...set].sort((x, y) => (x === home ? -1 : y === home ? 1 : x.localeCompare(y, "en")));
}

/** One through market that changes planes at the hub (weekly, both directions). */
export interface ConnectingMarketRow {
  key: string;
  origin: string;
  destination: string;
  /** Through passengers a week, both directions. */
  passengers: number;
  /** Share of the hub's transfer passengers. */
  shareOfTransfers: number;
  throughFare: number;
  /** Through revenue a week, both directions. */
  revenue: number;
  /** Player's share of the through market. */
  marketShare: number;
}

/** Connecting passenger analysis of a hub: who changes planes there, and how much of the hub's traffic that is. */
export interface ConnectingAnalysis {
  /** Passengers a week who change planes at the hub (each counted once, both directions); null without reports. */
  transferPassengers: number | null;
  /** Passengers a week who start or end their trip at the hub, or connect elsewhere. */
  localPassengers: number;
  /** Transfer passengers as a share of all passengers using the hub (each person counted once). */
  transferShare: number | null;
  /** Share of seats sold on the hub's routes that are filled by passengers changing planes here. */
  shareOfBoardings: number | null;
  revenue: number;
  /** The largest through markets (each route lists only its own largest; smaller ones are counted in the totals only). */
  markets: ConnectingMarketRow[];
  /** All through markets connecting here, listed or not. */
  marketCount: number;
}

/**
 * Through markets that connect at `hub`, largest first. A transfer passenger rides two of the hub's routes, so the hub's
 * passenger total counts them once: route passengers minus transfers.
 */
export function buildConnectingAnalysis(routes: readonly Route[], reports: Reports, hub: string): ConnectingAnalysis {
  const seen = new Map<string, ConnectingMarketRow>();
  let boardings = 0, any = false;
  // Exact totals from each route's per-hub figures. A transfer rides two of the hub's routes, so summing one-way passengers over
  // the routes gives both directions; the prorated revenue shares of the two legs add up to the through revenue.
  let viaPax = 0, viaRevenue = 0, viaMarkets = 0, haveVia = false;
  for (const r of routes) {
    if (r.origin !== hub && r.destination !== hub) continue;
    const rep = reports[r.id];
    if (!rep) continue;
    any = true;
    boardings += rep.evaluation.passengersPerWeek;
    if (rep.connecting?.viaHub) haveVia = true;
    const via = rep.connecting?.viaHub?.[hub];
    if (via) { viaPax += via.passengersOneWay; viaRevenue += via.revenue; viaMarkets += via.markets; }
    for (const m of rep.connecting?.markets ?? []) {
      if (m.hub !== hub) continue;
      const key = m.origin < m.destination ? `${m.origin}-${m.destination}` : `${m.destination}-${m.origin}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        key, origin: m.origin, destination: m.destination, passengers: 2 * m.passengersOneWay, shareOfTransfers: 0,
        throughFare: m.throughFare, revenue: m.revenue, marketShare: m.share,
      });
    }
  }
  const markets = [...seen.values()].sort((a, b) => b.passengers - a.passengers || a.key.localeCompare(b.key, "en"));
  // Older saves have no per-hub figures: fall back to the listed markets.
  const transfers = haveVia ? viaPax : markets.reduce((s, m) => s + m.passengers, 0);
  for (const m of markets) m.shareOfTransfers = transfers > 0 ? m.passengers / transfers : 0;
  const people = boardings - transfers;
  return {
    transferPassengers: any ? transfers : null,
    localPassengers: Math.max(0, people - transfers),
    transferShare: any && people > 0 ? Math.min(1, transfers / people) : null,
    shareOfBoardings: any && boardings > 0 ? Math.min(1, (2 * transfers) / boardings) : null,
    revenue: haveVia ? viaRevenue : markets.reduce((s, m) => s + m.revenue, 0),
    markets,
    marketCount: haveVia ? Math.max(markets.length, Math.round(viaMarkets / 2)) : markets.length,
  };
}
