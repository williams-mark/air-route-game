// Pure rows for the Hub board view. No React, no sim calls: the caller supplies reports and block-hour figures.
import type { Route } from "@arg/contracts";
import { connectingShare as sharedConnectingShare, loadByCabin, type CabinLoadFactor, type RouteReport } from "@arg/sim";
import type { FleetItem } from "../sim/bridge";
import { hubOptions } from "../fleet/typeTable";

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

/** Hubs to offer: home first, then every hub of the fleet, then airports that two or more routes touch. */
export function boardHubOptions(fleet: readonly FleetItem[], routes: readonly Route[], home?: string): string[] {
  const set = new Set(hubOptions(fleet, home));
  const touch = new Map<string, number>();
  for (const r of routes) for (const id of [r.origin, r.destination]) touch.set(id, (touch.get(id) ?? 0) + 1);
  for (const [id, n] of touch) if (n >= 2) set.add(id);
  return [...set].sort((x, y) => (x === home ? -1 : y === home ? 1 : x.localeCompare(y, "en")));
}
