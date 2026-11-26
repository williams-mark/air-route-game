// Fast tier of the hub connection model (MODEL.md 9c). The full tier (`evaluateHubConnection`) sizes the synthetic rivals with a
// choice run of its own and re-prices both legs; that costs about 0.27 ms a market. A hub with n destinations has about n^2/2
// markets (11,000 for 150 destinations), so only each hub's largest markets get the full model. Every other sensible market
// uses this fast tier:
//
//   * the same itinerary utility (`itineraryUtility`: fare, elapsed time, layover, misconnect risk, connection hassle, frequency,
//     quality) and the same outside option (`outsideUtility`) as the full model, per passenger segment;
//   * the same synthetic rivals (`buildRivals`), but sized on the market directly instead of with an extra choice run;
//   * no capacity terms: the result is the share of the market that would choose the connection if seats were unlimited. Seats
//     are then shared out over all fast-tier markets by `evaluateNetwork` (proportional allocation per leg).
//
// Shares change only when an input changes, so they are cached per market and refreshed on a rolling weekly cycle: each market
// is re-solved once a week, on its own day (a hash of the market spreads the work evenly), or at once if a leg's frequency,
// fare, speed or the through fare changes. The cache is a pure memo of its inputs, so results are deterministic.
import { saturateQuality } from "../policy/product";
import type { Airport, Day } from "@arg/contracts";
import { itineraryUtility, outsideUtility, type Itinerary } from "../demand/choice";
import { SEGMENTS, type Segment } from "../demand/market";
import { outsideFor } from "../demand/fares";
import { marketOnDay } from "../demand/market";
import { distanceKm } from "../geo";
import { buildRivals, DEFAULT_ROUTE_MODEL_CONFIG } from "./routeModel";

export interface FastLeg {
  /** Weekly round trips actually flown. */
  frequency: number;
  /** Average cruise speed of the aircraft flying it (km/h). */
  speedKmh: number;
  /** Optional precomputed cache signature of frequency and speed (saves building it for every market the leg is part of). */
  sig?: string;
}

/** Share of each segment's market that would choose the player's connection with unlimited seats (0..1). */
export type SegmentShares = Record<Segment, number>;

const CACHE = new Map<string, SegmentShares>();
const CACHE_LIMIT = 200_000;

/** Stable small hash of a string (FNV-1a), for spreading markets over the days of the week. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Same leg geometry as the full model (`makeLeg` in routeModel.ts): block time from distance and speed. */
function leg(id: string, o: string, d: string, dist: number, speedKmh: number, freq: number) {
  return { id, origin: o, destination: d, distanceKm: dist, blockMin: ((dist * 1.04) / (speedKmh * 0.93) + 0.5) * 60, weeklyFrequency: freq, weeklySeats: Infinity };
}

/**
 * Unconstrained connection shares for the market a-hub-b, cached for the market's current week. `day` picks the week (rolling:
 * the market's refresh day is fixed by a hash of its airports).
 */
export function fastConnectionShares(a: Airport, hub: Airport, b: Airport, leg1: FastLeg, leg2: FastLeg, throughFare: number, day: Day, competitors?: Itinerary[], product?: FastProduct): SegmentShares {
  const key0 = `${a.id}|${hub.id}|${b.id}`;
  const week = Math.floor((day + (hash(key0) % 7)) / 7);
  const sig = (l: FastLeg) => l.sig ?? `${l.frequency.toFixed(2)}|${Math.round(l.speedKmh)}`;
  // World field: the competitors are part of the key (they change at most weekly, with the rivals' step).
  const comp = competitors ? `|c${competitors.map((c) => `${c.id}:${Math.round(c.fare)}:${c.legs.map((l) => l.weeklyFrequency.toFixed(1)).join("/")}`).join(",")}` : "";
  const key = `${key0}|${week}|${sig(leg1)}|${sig(leg2)}|${Math.round(throughFare * 100)}${comp}${product ? `|p${product.qualityDelta.toFixed(4)}:${product.perceivedFareUsd.toFixed(2)}` : ""}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  const cfg = DEFAULT_ROUTE_MODEL_CONFIG;
  const p = cfg.choice;
  const dist = distanceKm(a, b);
  // Solve on the market of the week's refresh day, so a cached value does not depend on which day first asked for it.
  const refDay = week * 7 - (hash(key0) % 7);
  const market = marketOnDay(a, b, refDay, cfg.market);
  const rivals = competitors ?? buildRivals(a, b, dist, market, cfg);
  const player: Itinerary = {
    id: `fast:${key0}`, carrier: "player", fare: product ? Math.max(1, throughFare + product.perceivedFareUsd) : throughFare,
    quality: product ? saturateQuality(0.5 + product.qualityDelta, rivals.length > 0 ? Math.max(...rivals.map((r) => r.quality)) : null) : 0.5,
    marketDistanceKm: dist,
    legs: [leg("p1", a.id, hub.id, distanceKm(a, hub), leg1.speedKmh, leg1.frequency), leg("p2", hub.id, b.id, distanceKm(hub, b), leg2.speedKmh, leg2.frequency)],
  };
  const outside = outsideFor(a, b, dist);
  const out = {} as SegmentShares;
  for (const s of SEGMENTS) {
    const up = itineraryUtility(player, s, p).total;
    let denom = Math.exp(up) + Math.exp(outsideUtility(s, outside, p));
    for (const r of rivals) denom += Math.exp(itineraryUtility(r, s, p).total);
    out[s] = Number.isFinite(up) && denom > 0 ? Math.exp(up) / denom : 0;
  }
  if (CACHE.size >= CACHE_LIMIT) CACHE.clear();
  CACHE.set(key, out);
  return out;
}

/** One-way weekly passengers who would choose the connection on `day` (seasonal market x cached shares), before seat limits. */
/** The product policy's effect on a connecting itinerary (policy/product.ts productEffect for the market's band). */
export interface FastProduct { qualityDelta: number; perceivedFareUsd: number }

export function fastConnectionDemand(a: Airport, hub: Airport, b: Airport, leg1: FastLeg, leg2: FastLeg, throughFare: number, day: Day, competitors?: Itinerary[], product?: FastProduct): number {
  const shares = fastConnectionShares(a, hub, b, leg1, leg2, throughFare, day, competitors, product);
  const market = marketOnDay(a, b, day, DEFAULT_ROUTE_MODEL_CONFIG.market);
  let pax = 0;
  for (const s of SEGMENTS) pax += market.bySegment[s] * shares[s];
  return pax;
}

/** For tests: forget every cached share. */
export function clearFastConnectionCache(): void { CACHE.clear(); }
