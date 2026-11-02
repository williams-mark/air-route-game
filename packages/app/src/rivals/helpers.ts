// Fog-of-war helpers for the rivals UI. Everything here works from rivalReports()/the public rival fields only: no cash, no profit.
import type { Id, Route } from "@arg/contracts";
import { rivalReports, type Archetype, type RivalMarketCarrier, type RivalMarketReport, type SimState } from "@arg/sim";

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
}

export interface RivalsView {
  list: RivalListItem[];
  markets: RivalMarketReport[];
}

export const EMPTY_RIVALS: RivalsView = { list: [], markets: [] };

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
  })).sort((x, y) => (x.status === y.status ? x.name.localeCompare(y.name) : x.status === "active" ? -1 : 1));
  return { list, markets: rivalReports(sim) };
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
