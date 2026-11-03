import type { Airport } from "@arg/contracts";
import { displayLon, distanceKm, routePath, screenBearing } from "./geo";
import type { MapRoute, ProfitTier } from "./types";

export interface RouteGeo {
  route: MapRoute;
  o: Airport;
  d: Airport;
  path: [number, number][];
  km: number;
  flightMin: number;
  cycleMin: number;
  aircraft: number;
  seed: number;
  hubToHub: boolean;
}

export interface AggEdge {
  id: string;
  a: Airport;
  b: Airport;
  path: [number, number][];
  routes: number;
  freq: number;
  tier: ProfitTier;
}

export interface MapModel {
  airports: Airport[];
  byId: Map<string, Airport>;
  hubs: Set<string>;
  hubRank: Map<string, number>;
  /** Overall importance rank of every airport (0 = biggest), by slots per hour then metro population. */
  rank: Map<string, number>;
  /** Airports that at least one route touches. */
  served: Set<string>;
  routes: RouteGeo[];
  agg: AggEdge[];
}

/** Sample points along a great circle: about one per 150 km, 24..64. */
const pathPoints = (km: number) => Math.max(24, Math.min(64, Math.ceil(km / 150)));
const CRUISE_KM_PER_MIN = 14; // ~840 km/h
const TURNAROUND_MIN = 45;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Airport with its longitude shifted to the display side of the date line (same object when no shift is needed). */
export function toDisplay(a: Airport): Airport {
  const lon = displayLon(a.lon, a.lat);
  return lon === a.lon ? a : { ...a, lon };
}

const bySize = (a: Airport, b: Airport) => b.slotsPerHour - a.slotsPerHour || b.metroPopulation - a.metroPopulation || (a.id < b.id ? -1 : 1);

/** Hubs: the biggest airports (about 15% of a small network, up to 24 of a world-sized one), plus the biggest of every land mass. */
export function pickHubs(airports: Airport[]): string[] {
  const sorted = [...airports].sort(bySize);
  const n = airports.length <= 60 ? Math.min(8, Math.max(4, Math.round(airports.length * 0.15))) : Math.min(24, 8 + Math.round((airports.length - 60) * 0.03));
  const hubs = sorted.slice(0, n).map((a) => a.id);
  // Every land mass keeps a hub (so Hawaii, Alaska, Ireland... have a cluster centre): swap the best airport of a missing land mass into the lowest slot not already guaranteed.
  const best = new Map<string, Airport>();
  for (const a of sorted) if (!best.has(a.landmass)) best.set(a.landmass, a);
  let slot = hubs.length - 1;
  for (const a of [...best.values()].sort(bySize)) {
    if (hubs.includes(a.id)) continue;
    if (slot < Math.floor(n / 2)) break;
    hubs[slot--] = a.id;
  }
  return hubs;
}

export function buildModel(rawAirports: Airport[], routes: MapRoute[]): MapModel {
  const airports = rawAirports.map(toDisplay);
  const byId = new Map(airports.map((a) => [a.id, a]));
  const hubList = pickHubs(airports);
  const hubs = new Set(hubList);
  const hubRank = new Map(hubList.map((h, i) => [h, i]));
  const rank = new Map([...airports].sort((a, b) => (hubRank.get(a.id) ?? 1e6) - (hubRank.get(b.id) ?? 1e6) || bySize(a, b)).map((a, i) => [a.id, i]));
  const served = new Set<string>();

  const cluster = new Map<string, Airport>();
  for (const a of airports) {
    let best: Airport | undefined, bd = Infinity;
    for (const h of hubList) {
      const ha = byId.get(h)!;
      const d = distanceKm(a.lon, a.lat, ha.lon, ha.lat);
      if (d < bd) { bd = d; best = ha; }
    }
    if (best) cluster.set(a.id, best);
  }

  const geos: RouteGeo[] = [];
  const aggMap = new Map<string, { a: Airport; b: Airport; routes: number; freq: number; tiers: Record<ProfitTier, number> }>();
  for (const r of routes) {
    const o = byId.get(r.origin), d = byId.get(r.destination);
    if (!o || !d) continue;
    const km = distanceKm(o.lon, o.lat, d.lon, d.lat);
    served.add(o.id); served.add(d.id);
    const flightMin = km / CRUISE_KM_PER_MIN + 15;
    const cycleMin = 2 * (flightMin + TURNAROUND_MIN);
    geos.push({
      route: r, o, d, km, flightMin, cycleMin,
      path: routePath(o.lon, o.lat, d.lon, d.lat, pathPoints(km)),
      aircraft: Math.max(1, Math.min(3, Math.ceil(r.weeklyFrequency / 14))),
      seed: hash(r.id), hubToHub: hubs.has(o.id) && hubs.has(d.id),
    });
    const ca = cluster.get(o.id), cb = cluster.get(d.id);
    if (!ca || !cb || ca.id === cb.id) continue;
    const [x, y] = ca.id < cb.id ? [ca, cb] : [cb, ca];
    const key = `${x.id}|${y.id}`;
    let e = aggMap.get(key);
    if (!e) aggMap.set(key, (e = { a: x, b: y, routes: 0, freq: 0, tiers: { profit: 0, marginal: 0, loss: 0, planned: 0 } }));
    e.routes++; e.freq += r.weeklyFrequency; e.tiers[r.tier] += r.weeklyFrequency;
  }
  const agg: AggEdge[] = [...aggMap.entries()].map(([id, e]) => {
    const tier = (Object.entries(e.tiers).sort((p, q) => q[1] - p[1])[0]![0]) as ProfitTier;
    return { id, a: e.a, b: e.b, routes: e.routes, freq: e.freq, tier, path: routePath(e.a.lon, e.a.lat, e.b.lon, e.b.lat, pathPoints(distanceKm(e.a.lon, e.a.lat, e.b.lon, e.b.lat))) };
  });
  return { airports, byId, hubs, hubRank, rank, served, routes: geos, agg };
}

export interface AircraftPos { id: string; position: [number, number]; angle: number }

/** Positions of all in-flight aircraft at simTime (sim-minutes). Pure function of simTime. */
export function aircraftAt(geos: RouteGeo[], simTime: number, onlyHubToHub: boolean): AircraftPos[] {
  const out: AircraftPos[] = [];
  for (const g of geos) {
    if (onlyHubToHub && !g.hubToHub) continue;
    for (let k = 0; k < g.aircraft; k++) {
      const offset = (g.seed % 9973) + (k * g.cycleMin) / g.aircraft;
      const p = (((simTime + offset) % g.cycleMin) + g.cycleMin) % g.cycleMin;
      const legTurn = g.flightMin + TURNAROUND_MIN;
      let f: number, rev: boolean;
      if (p < g.flightMin) { f = p / g.flightMin; rev = false; }
      else if (p >= legTurn && p < legTurn + g.flightMin) { f = 1 - (p - legTurn) / g.flightMin; rev = true; }
      else continue; // on the ground
      const n = g.path.length - 1;
      const x = f * n, i = Math.min(n - 1, Math.floor(x)), t = x - i;
      const A = g.path[i]!, B = g.path[i + 1]!;
      const pos: [number, number] = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const brg = screenBearing(A, B);
      out.push({ id: g.route.id, position: pos, angle: -(rev ? (brg + 180) % 360 : brg) });
    }
  }
  return out;
}
