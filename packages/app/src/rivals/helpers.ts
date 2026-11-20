// Fog-of-war helpers for the rivals UI. Everything here works from rivalReports()/the public rival fields only: no cash, no profit.
import type { Id, Route } from "@arg/contracts";
import { airportById } from "@arg/data";
import { distanceKm, rivalReports, type Archetype, type RivalMarketCarrier, type RivalMarketReport, type RivalNewsItem, type SimState } from "@arg/sim";

export interface RivalListItem {
  id: Id;
  name: string;
  archetype: Archetype;
  hub: Id;
  /** Coarse fleet size, never the exact number. */
  fleetBand: string;
  routeCount: number;
  status: "active" | "bankrupt";
  foundedDay: number;
  /** Outstations (world field; announced publicly when opened). */
  outstations: Id[];
  /** Aircraft on order (announced publicly when ordered). */
  onOrder: number;
}

export interface RivalsView {
  list: RivalListItem[];
  markets: RivalMarketReport[];
  /** Public news (launches, orders, outstations, fare moves), oldest first. */
  news: RivalNewsItem[];
}

export const EMPTY_RIVALS: RivalsView = { list: [], markets: [], news: [] };

export function fleetBand(n: number): string {
  if (n <= 0) return "none";
  if (n <= 5) return "1 to 5";
  if (n <= 12) return "6 to 12";
  if (n <= 25) return "13 to 25";
  if (n <= 50) return "26 to 50";
  return "50+";
}

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  legacy: "Legacy carrier", lcc: "Low-cost carrier", regional: "Regional", interisland: "Inter-island",
};

export function buildRivalsView(sim: Pick<SimState, "rivals" | "world">): RivalsView {
  const r = sim.rivals;
  if (!r) return EMPTY_RIVALS;
  const list = r.airlines.map((a): RivalListItem => ({
    id: a.id, name: a.name, archetype: a.archetype, hub: a.bases[0] ?? "", fleetBand: a.status === "active" ? fleetBand(a.fleet.length) : "none",
    routeCount: a.status === "active" ? a.routes.length : 0, status: a.status, foundedDay: a.foundedDay,
    outstations: a.status === "active" ? [...(a.outstations ?? [])] : [], onOrder: a.status === "active" ? (a.orders ?? []).reduce((n, o) => n + o.count, 0) : 0,
  })).sort((x, y) => (x.status === y.status ? x.name.localeCompare(y.name) : x.status === "active" ? -1 : 1));
  return { list, markets: rivalReports(sim), news: r.news.slice(-300) };
}

const key = (a: Id, b: Id) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function marketFor(view: RivalsView, origin: Id, destination: Id): RivalMarketReport | undefined {
  const k = key(origin, destination);
  return view.markets.find((m) => key(m.origin, m.destination) === k);
}

export function marketsOf(view: RivalsView, rivalId: Id): Array<{ market: RivalMarketReport; carrier: RivalMarketCarrier }> {
  const out: Array<{ market: RivalMarketReport; carrier: RivalMarketCarrier }> = [];
  for (const m of view.markets) {
    const c = m.carriers.find((x) => x.rivalId === rivalId);
    if (c) out.push({ market: m, carrier: c });
  }
  return out.sort((a, b) => b.carrier.weeklySeats - a.carrier.weeklySeats);
}

/** "$120 to $140" */
export function fareBandText(b: { low: number; high: number }): string {
  return `$${b.low} to $${b.high}`;
}

/** How the player's economy fare compares with a rival band. */
export function fareVsBand(yours: number, band: { low: number; high: number }): "below" | "within" | "above" {
  return yours < band.low ? "below" : yours > band.high ? "above" : "within";
}

export interface CompetitionSummary {
  carriers: RivalMarketCarrier[];
  rivalSeats: number;
  /** Rival share of all weekly seats in the market, given the player's own seats. */
  rivalSeatShare: number;
  yourFare: number;
}

export function competitionFor(view: RivalsView, route: Route, yourWeeklySeats: number): CompetitionSummary | null {
  const m = marketFor(view, route.origin, route.destination);
  if (!m || m.carriers.length === 0) return null;
  const total = m.totalWeeklySeats + Math.max(0, yourWeeklySeats);
  return { carriers: m.carriers, rivalSeats: m.totalWeeklySeats, rivalSeatShare: total > 0 ? m.totalWeeklySeats / total : 0, yourFare: route.fares.Y };
}

/** Fares scaled by a factor, rounded to whole dollars (never below 20). */
export function scaleFares(f: Route["fares"], factor: number): Route["fares"] {
  const s = (v: number) => Math.max(20, Math.round(v * factor));
  return { Y: s(f.Y), ...(f.W !== undefined ? { W: s(f.W) } : {}), ...(f.J !== undefined ? { J: s(f.J) } : {}), ...(f.F !== undefined ? { F: s(f.F) } : {}) };
}

// ---------------------------------------------------------------------------
// Airport and route views (Rivals screen). Schedules only: who flies where, how often, on what, at about what fare.
// ---------------------------------------------------------------------------

/** What an airline is at an airport. */
export type AirportRole = "hub" | "outstation" | "flies";

export interface AirportAirline {
  rival: RivalListItem;
  role: AirportRole;
  /** Its markets touching the airport: the far end and its schedule there, busiest first. */
  destinations: Array<{ to: Id; carrier: RivalMarketCarrier }>;
  /** Round trips a week from the airport, all its markets together. */
  departures: number;
  /** One-way seats a week from the airport. */
  seats: number;
}

/** Every rival operating at an airport: its role there and where it flies from it. Hubs first, then outstations, then by seats. */
export function airportPresence(view: RivalsView, airportId: Id): AirportAirline[] {
  const byId = new Map(view.list.map((r) => [r.id, r]));
  const out = new Map<Id, AirportAirline>();
  for (const m of view.markets) {
    if (m.origin !== airportId && m.destination !== airportId) continue;
    const to = m.origin === airportId ? m.destination : m.origin;
    for (const c of m.carriers) {
      const rival = byId.get(c.rivalId);
      if (!rival) continue;
      let e = out.get(c.rivalId);
      if (!e) {
        const role: AirportRole = rival.hub === airportId ? "hub" : rival.outstations.includes(airportId) ? "outstation" : "flies";
        out.set(c.rivalId, (e = { rival, role, destinations: [], departures: 0, seats: 0 }));
      }
      e.destinations.push({ to, carrier: c });
      e.departures += c.weeklyFrequency;
      e.seats += c.weeklySeats;
    }
  }
  // Bases with no route yet still count as presence.
  for (const r of view.list) {
    if (r.status !== "active" || out.has(r.id)) continue;
    if (r.hub === airportId) out.set(r.id, { rival: r, role: "hub", destinations: [], departures: 0, seats: 0 });
    else if (r.outstations.includes(airportId)) out.set(r.id, { rival: r, role: "outstation", destinations: [], departures: 0, seats: 0 });
  }
  const rank: Record<AirportRole, number> = { hub: 0, outstation: 1, flies: 2 };
  for (const e of out.values()) e.destinations.sort((x, y) => y.carrier.weeklySeats - x.carrier.weeklySeats || x.to.localeCompare(y.to));
  return [...out.values()].sort((x, y) => rank[x.role] - rank[y.role] || y.seats - x.seats || x.rival.name.localeCompare(y.rival.name));
}

export interface OneStopCompetitor {
  rivalId: Id;
  name: string;
  /** The rival base the trip connects at. */
  via: Id;
  /** Round trips a week of the less frequent leg. */
  weeklyFrequency: number;
}

/**
 * Who competes with one of the player's routes: nonstops in the same market, and one-stops a rival sells through one of its own
 * bases when it flies both legs and the trip does not double back (at most 2x the direct distance), the same rule as the sim's
 * competitor list (`competitorItinerariesFor`).
 */
export function routeCompetitors(view: RivalsView, origin: Id, destination: Id): { nonstop: RivalMarketCarrier[]; oneStop: OneStopCompetitor[] } {
  const nonstop = marketFor(view, origin, destination)?.carriers ?? [];
  const oneStop: OneStopCompetitor[] = [];
  for (const r of view.list) {
    if (r.status !== "active") continue;
    for (const via of [r.hub, ...r.outstations]) {
      if (!via || via === origin || via === destination) continue;
      const o = airportById.get(origin), h = airportById.get(via), d = airportById.get(destination);
      if (o && h && d && distanceKm(o, h) + distanceKm(h, d) > 2 * distanceKm(o, d)) continue;
      const a = marketFor(view, origin, via)?.carriers.find((c) => c.rivalId === r.id);
      const b = marketFor(view, via, destination)?.carriers.find((c) => c.rivalId === r.id);
      if (a && b) oneStop.push({ rivalId: r.id, name: r.name, via, weeklyFrequency: Math.min(a.weeklyFrequency, b.weeklyFrequency) });
    }
  }
  return { nonstop: [...nonstop].sort((x, y) => y.weeklySeats - x.weeklySeats), oneStop: oneStop.sort((x, y) => y.weeklyFrequency - x.weeklyFrequency || x.name.localeCompare(y.name)) };
}

/** Recent moves (newest first) touching any of `airports` or made by any of `airlines` (orders, fare policy), plus launches and failures. */
export function newsAt(view: RivalsView, airports: ReadonlySet<Id>, airlines: ReadonlySet<Id> = new Set(), limit = 30): RivalNewsItem[] {
  const near = (n: RivalNewsItem) => (n.origin !== undefined && airports.has(n.origin)) || (n.destination !== undefined && airports.has(n.destination)) || (n.origin === undefined && airlines.has(n.rivalId));
  return [...view.news].reverse().filter((n) => near(n) || n.kind === "launch" || n.kind === "bankrupt").slice(0, limit);
}
