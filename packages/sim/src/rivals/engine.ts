import type { Aircraft, AircraftType, Airport, Day, Id, Route, SimEvent } from "@arg/contracts";
import { canFlyRoute } from "@arg/data";
import { benchmarkFare, runChoice, type Itinerary } from "../demand/choice";
import { baseWeeklyDemand, marketOnDay, segmentMap } from "../demand/market";
import { aircraftEquivalentFor, evaluateRoute, isRangeFeasible, monthlyOwnershipUsd, type CabinInput } from "../finance/ledger";
import { defaultLayout } from "../fleet/layout";
import { distanceKm } from "../geo";
import { makeRng, mixSeed } from "../rng";
import { buildRivals, DEFAULT_ROUTE_MODEL_CONFIG, ROUTE_CHOICE_PARAMS } from "../route/routeModel";
import { carriedShare } from "../route/rivalSizing";
import { dayToDate } from "../time/calendar";
import {
  ARCHETYPES, ENTRANT_NAME_POOL, RIVAL_PARAMS as RP, SCHEDULED_ENTRANTS, STARTING_RIVALS,
  type ArchetypeSpec, type EntrantSpec,
} from "./config";
import type {
  Archetype, BankruptcyRecord, RivalAircraft, RivalAirline, RivalMemory, RivalNewsItem, RivalNewsKind, RivalRoute, RivalsState,
} from "./types";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * Potential demand a new rival route is sized on: `baseWeeklyDemand` scaled down on pairs where most passengers drive
 * (carried share relative to the 0.8 an ordinary air market carries, capped at 1), so rivals do not fly empty on LAX-SAN.
 */
export function sizingDemand(ctx: RivalCtx, a: Airport, b: Airport): number {
  const dist = distanceKm(a, b);
  const m = marketOnDay(a, b, ctx.day);
  const share = carriedShare(a, b, dist, m.bySegment, benchmarkFare(dist), ROUTE_CHOICE_PARAMS);
  return baseWeeklyDemand(a, b) * Math.min(1, share / 0.8);
}

export const marketKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface RivalCtx {
  airports: ReadonlyMap<string, Airport>;
  types: ReadonlyMap<string, AircraftType>;
  day: Day;
  year: number;
  rng: () => number;
  /** Player routes by market key, with the seats and fare they currently put in the market. */
  player: Map<string, { route: Route; seatsPerFlight: number; frequency: number }>;
}

/** Stricter of the data package's feasibility (`canFlyRoute`) and the ledger's own range/runway test. */
export function canServe(t: AircraftType, a: Airport, b: Airport): boolean {
  return canFlyRoute(t, a, b) && isRangeFeasible(distanceKm(a, b), t) && a.runwayM >= t.runwayNeededM && b.runwayM >= t.runwayNeededM;
}

const seatsFor = (spec: ArchetypeSpec, t: AircraftType) => Math.max(1, Math.floor(t.maxSeats * spec.seatDensity));

function cabinsOf(spec: ArchetypeSpec, seats: number, fare: number): CabinInput[] {
  const j = Math.round(seats * spec.premiumSeatShare);
  const out: CabinInput[] = [];
  if (j > 0) out.push({ cls: "J", seats: j, fare: fare * spec.premiumFareMult });
  out.push({ cls: "Y", seats: seats - j, fare });
  return out;
}

const typeAvailable = (t: AircraftType, year: number, owned: boolean) =>
  t.introYear <= year && (owned || t.endYear === null || t.endYear >= year - 14);

const monthlyLease = (t: AircraftType) => monthlyOwnershipUsd(t);
const weeklyLease = (t: AircraftType) => (monthlyLease(t) * 12) / 52 + RP.aircraftOverheadPerDay * 7;

function blockMin(dist: number, speedKmh: number) {
  return ((dist * 1.04) / (speedKmh * 0.93) + 0.5) * 60;
}

// ---------------------------------------------------------------------------
// Itineraries and market evaluation (same demand model, same ledger as the player)
// ---------------------------------------------------------------------------

export function rivalItinerary(air: RivalAirline, rt: RivalRoute, dist: number, t: AircraftType): Itinerary {
  const id = `rv:${air.id}:${marketKey(rt.origin, rt.destination)}`;
  return {
    id, carrier: air.id, fare: rt.fare, quality: ARCHETYPES[air.archetype].quality, marketDistanceKm: dist,
    legs: [{
      id, origin: rt.origin, destination: rt.destination, distanceKm: dist, blockMin: blockMin(dist, t.cruiseKmh),
      weeklyFrequency: rt.frequency, weeklySeats: rt.frequency * rt.seatsPerFlight,
    }],
  };
}

export interface RouteResult {
  passengers: number;
  revenue: number;
  /** Route-level costs from the ledger, no aircraft ownership. */
  costs: number;
  profit: number;
  loadFactor: number;
  seats: number;
  /** Fractional ownership + aircraft overhead + indirect costs for this route (used for decisions). */
  ownership: number;
}

interface Entry { air: RivalAirline; route: RivalRoute }

function playerItinerary(ctx: RivalCtx, key: string, a: Airport, b: Airport, dist: number): Itinerary | null {
  const p = ctx.player.get(key);
  if (!p || p.frequency <= 0) return null;
  const t = ctx.types.get(p.route.typeId);
  if (!t) return null;
  const id = `player:${p.route.id}`;
  return {
    id, carrier: "player", fare: p.route.fares.Y, quality: 0.5, marketDistanceKm: dist,
    legs: [{
      id, origin: a.id, destination: b.id, distanceKm: dist, blockMin: blockMin(dist, t.cruiseKmh),
      weeklyFrequency: p.frequency, weeklySeats: p.frequency * p.seatsPerFlight,
    }],
  };
}

/** Evaluate every rival entry in one market (plus the player and the synthetic one-stop) with the shared choice model. */
export function evaluateMarket(ctx: RivalCtx, a: Airport, b: Airport, entries: Entry[]): Map<RivalRoute, RouteResult> {
  const dist = distanceKm(a, b);
  const key = marketKey(a.id, b.id);
  const market = marketOnDay(a, b, ctx.day);
  const demand = segmentMap((s) => market.bySegment[s]);
  const its: Itinerary[] = [];
  const index: (RivalRoute | null)[] = [];
  const pl = playerItinerary(ctx, key, a, b, dist);
  if (pl) { its.push(pl); index.push(null); }
  const live: Entry[] = [];
  for (const e of entries) {
    const t = ctx.types.get(e.route.typeId);
    if (!t) continue;
    its.push(rivalItinerary(e.air, e.route, dist, t));
    index.push(e.route);
    live.push(e);
  }
  for (const c of buildRivals(a, b, dist, market, DEFAULT_ROUTE_MODEL_CONFIG).filter((i) => i.id.startsWith("conn:"))) {
    its.push(c); index.push(null);
  }
  const choice = runChoice({
    demand, itineraries: its,
    outside: { distanceKm: dist, driveAvailable: a.region === "CA" && b.region === "CA" },
    params: ROUTE_CHOICE_PARAMS,
  });
  const out = new Map<RivalRoute, RouteResult>();
  index.forEach((rt, i) => {
    if (!rt) return;
    const air = live.find((e) => e.route === rt)!.air;
    const t = ctx.types.get(rt.typeId)!;
    const spec = ARCHETYPES[air.archetype];
    const pax = choice.itineraries[i]!.passengers;
    const ev = evaluateRoute({
      origin: a, destination: b, aircraft: t, day: ctx.day, weeklyFrequency: rt.frequency,
      cabins: cabinsOf(spec, rt.seatsPerFlight, rt.fare), weeklyPassengers: 2 * pax, ownership: "excluded",
    });
    out.set(rt, {
      passengers: pax, revenue: ev.revenue, costs: ev.costs, profit: ev.profit, loadFactor: ev.loadFactor,
      seats: ev.seatsPerWeek,
      ownership: aircraftEquivalentFor(dist, t, rt.frequency) * weeklyLease(t) + ev.revenue * spec.indirectCostPct,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------

function needByType(air: RivalAirline, ctx: RivalCtx): Map<string, number> {
  const need = new Map<string, number>();
  for (const r of air.routes) {
    const t = ctx.types.get(r.typeId);
    const a = ctx.airports.get(r.origin);
    const b = ctx.airports.get(r.destination);
    if (!t || !a || !b) continue;
    need.set(r.typeId, (need.get(r.typeId) ?? 0) + aircraftEquivalentFor(distanceKm(a, b), t, r.frequency) * RP.fleetSpareFactor);
  }
  return need;
}

const ownedCount = (air: RivalAirline, typeId: string) => air.fleet.reduce((n, f) => n + (f.typeId === typeId ? 1 : 0), 0);

/** Aircraft still to be leased per type for the current routes. */
function shortfall(air: RivalAirline, ctx: RivalCtx): Map<string, number> {
  const out = new Map<string, number>();
  for (const [typeId, need] of needByType(air, ctx)) {
    const gap = Math.ceil(need - 1e-9) - ownedCount(air, typeId);
    if (gap > 0) out.set(typeId, gap);
  }
  return out;
}

export function weeklyFixed(air: RivalAirline, ctx: RivalCtx): number {
  let c = ARCHETYPES[air.archetype].corporateOverheadPerDay * 7;
  for (const f of air.fleet) {
    const t = ctx.types.get(f.typeId);
    if (t) c += weeklyLease(t);
  }
  return c;
}

function acquire(air: RivalAirline, ctx: RivalCtx, typeId: string, count: number, age?: number) {
  const t = ctx.types.get(typeId)!;
  const inProd = t.endYear === null || t.endYear >= ctx.year;
  for (let i = 0; i < count; i++) {
    const years = age ?? (inProd ? ctx.rng() * 2.5 : 5 + ctx.rng() * 9);
    air.fleet.push({ id: `${air.id}-ac${++air.nextAircraft}`, typeId, ageDays: Math.round(years * 365) });
    air.cash -= RP.depositMonths * monthlyLease(t);
  }
}

function releaseSurplus(air: RivalAirline, ctx: RivalCtx): number {
  let released = 0;
  const need = needByType(air, ctx);
  for (const typeId of [...new Set(air.fleet.map((f) => f.typeId))].sort(cmp)) {
    const keep = Math.ceil((need.get(typeId) ?? 0) - 1e-9);
    const mine = air.fleet.filter((f) => f.typeId === typeId).sort((x, y) => y.ageDays - x.ageDays || cmp(x.id, y.id));
    const surplus = mine.length - keep;
    for (let i = 0; i < surplus; i++) {
      const gone = mine[i]!;
      air.fleet = air.fleet.filter((f) => f !== gone);
      // Returning a lease early forfeits the deposit and pays a termination charge.
      air.cash -= RP.earlyReturnMonths * monthlyLease(ctx.types.get(typeId)!);
      released++;
    }
  }
  return released;
}

/** Can the airline lease what a change needs and still keep its cash reserve? */
function canAffordGrowth(air: RivalAirline, ctx: RivalCtx): boolean {
  const spec = ARCHETYPES[air.archetype];
  let deposit = 0;
  for (const [typeId, n] of shortfall(air, ctx)) deposit += n * RP.depositMonths * monthlyLease(ctx.types.get(typeId)!);
  return air.cash - deposit >= spec.reserveWeeks * weeklyFixed(air, ctx) && air.lossWeeks < 8;
}

// ---------------------------------------------------------------------------
// News and notices
// ---------------------------------------------------------------------------

interface Sink {
  news: RivalNewsItem[];
  notices: SimEvent[];
}

function emit(ctx: RivalCtx, sink: Sink, air: RivalAirline, kind: RivalNewsKind, text: string, extra: Partial<RivalNewsItem> = {}) {
  const playerMarket = extra.origin && extra.destination ? ctx.player.has(marketKey(extra.origin, extra.destination)) : false;
  sink.news.push({ day: ctx.day, kind, rivalId: air.id, rivalName: air.name, playerMarket, text, ...extra });
  if (playerMarket || kind === "bankrupt" || kind === "launch") sink.notices.push({ kind: "notice", day: ctx.day, text });
}

// ---------------------------------------------------------------------------
// Aircraft choice and route creation
// ---------------------------------------------------------------------------

function chooseType(ctx: RivalCtx, air: RivalAirline, a: Airport, b: Airport, targetSeats: number): AircraftType | null {
  const spec = ARCHETYPES[air.archetype];
  const dist = distanceKm(a, b);
  const owned = new Set(air.fleet.map((f) => f.typeId));
  const opts: AircraftType[] = [];
  for (const id of spec.types) {
    const t = ctx.types.get(id);
    if (!t || !typeAvailable(t, ctx.year, owned.has(id))) continue;
    if (t.widebody && dist < 2500) continue;
    if (!canServe(t, a, b)) continue;
    opts.push(t);
  }
  if (opts.length === 0) return null;
  const good = opts.filter((t) => Math.ceil(targetSeats / seatsFor(spec, t)) >= spec.minFrequency);
  if (good.length === 0) return opts.sort((x, y) => seatsFor(spec, x) - seatsFor(spec, y) || cmp(x.id, y.id))[0]!;
  // Long thick sectors go to widebodies; otherwise the archetype's preference order decides, owned types first.
  const wide = dist > 3200 ? good.filter((t) => t.widebody) : [];
  const pool = wide.length > 0 ? wide : good;
  const rank = (t: AircraftType) => spec.types.indexOf(t.id);
  return pool.sort((x, y) => Number(owned.has(y.id)) - Number(owned.has(x.id)) || rank(x) - rank(y) || cmp(x.id, y.id))[0]!;
}

function otherFares(ctx: RivalCtx, all: Map<string, Entry[]>, key: string, except: RivalAirline | null): number[] {
  const f: number[] = [];
  for (const e of all.get(key) ?? []) if (e.air !== except) f.push(e.route.fare);
  const p = ctx.player.get(key);
  if (p) f.push(p.route.fares.Y);
  return f;
}

function marketIndex(rivals: RivalsState): Map<string, Entry[]> {
  const m = new Map<string, Entry[]>();
  for (const air of rivals.airlines) {
    if (air.status !== "active") continue;
    for (const route of air.routes) {
      const k = marketKey(route.origin, route.destination);
      const l = m.get(k);
      if (l) l.push({ air, route }); else m.set(k, [{ air, route }]);
    }
  }
  return m;
}

function makeRoute(ctx: RivalCtx, air: RivalAirline, a: Airport, b: Airport, t: AircraftType, freq: number, fare: number): RivalRoute {
  const spec = ARCHETYPES[air.archetype];
  return {
    id: `${air.id}:${air.nextRoute++}`, origin: a.id, destination: b.id, typeId: t.id, frequency: freq,
    seatsPerFlight: seatsFor(spec, t), baseFare: fare, fare, announcedFare: fare, enteredDay: ctx.day,
    profitHist: [], loadFactor: 0, revenue: 0, margin: 0, badQuarters: 0, baselineFrequency: freq, lastNoticeDay: -999,
  };
}

function quietMemory(ctx: RivalCtx, aggressor: string): RivalMemory {
  return { sinceDay: ctx.day, untilDay: ctx.day, maxUntilDay: ctx.day, aggressor, aggressorFare: 0, active: false, nextEpisodeDay: ctx.day };
}

/** Price/frequency plan for entering a market: sized to the airline's target share, priced against the field. */
function planEntry(ctx: RivalCtx, air: RivalAirline, all: Map<string, Entry[]>, a: Airport, b: Airport, freqOverride?: number) {
  const spec = ARCHETYPES[air.archetype];
  const dist = distanceKm(a, b);
  const base = sizingDemand(ctx, a, b);
  const target = (spec.entryShare * base) / RP.targetLoadFactor;
  const t = chooseType(ctx, air, a, b, target);
  if (!t) return null;
  const seats = seatsFor(spec, t);
  const wanted = Math.min(spec.maxEntryFrequency, Math.max(spec.minFrequency, Math.ceil(target / seats)));
  const freq = freqOverride ?? wanted;
  const bench = benchmarkFare(dist);
  let fare = bench * spec.fareFactor;
  const others = otherFares(ctx, all, marketKey(a.id, b.id), air);
  if (air.archetype === "lcc" && others.length > 0) fare = Math.min(fare, Math.min(...others) * 0.94);
  fare = Math.max(fare, bench * spec.floorFareFactor);
  return { t, freq, wanted, fare };
}

function estimateEntry(ctx: RivalCtx, air: RivalAirline, all: Map<string, Entry[]>, a: Airport, b: Airport, t: AircraftType, freq: number, fare: number) {
  const spec = ARCHETYPES[air.archetype];
  const cand = makeRoute(ctx, air, a, b, t, freq, fare);
  air.nextRoute--; // candidate only
  const entries = [...(all.get(marketKey(a.id, b.id)) ?? []), { air, route: cand }];
  const res = evaluateMarket(ctx, a, b, entries).get(cand);
  if (!res) return null;
  const trueProfit = res.profit - res.ownership;
  const noise = air.optimism + gauss(ctx.rng) * spec.estimateNoise;
  const est = trueProfit + res.revenue * noise;
  return { est, estMargin: res.revenue > 0 ? est / res.revenue : -1, trueProfit, res };
}

function candidatePairs(ctx: RivalCtx, air: RivalAirline): { a: Airport; b: Airport; demand: number }[] {
  const spec = ARCHETYPES[air.archetype];
  const have = new Set(air.routes.map((r) => marketKey(r.origin, r.destination)));
  const out: { a: Airport; b: Airport; demand: number }[] = [];
  const seen = new Set<string>();
  const hubs = air.archetype === "lcc" ? air.bases : air.bases;
  for (const baseId of hubs) {
    const a = ctx.airports.get(baseId);
    if (!a) continue;
    for (const b of ctx.airports.values()) {
      if (b.id === a.id) continue;
      const k = marketKey(a.id, b.id);
      if (have.has(k) || seen.has(k) || (air.exitedUntil[k] ?? 0) > ctx.day) continue;
      seen.add(k);
      const c = spec.candidate;
      if (c.interislandOnly && !(a.region === "HI" && b.region === "HI")) continue;
      if (!c.interislandOnly && air.archetype !== "legacy" && air.archetype !== "regional" && a.region === "HI" && b.region === "HI") continue;
      if (b.metroPopulation < c.minMetro || b.slotsPerHour < c.minSlots) continue;
      const d = distanceKm(a, b);
      if (d < c.minKm || d > c.maxKm) continue;
      const demand = baseWeeklyDemand(a, b);
      if (demand < c.minDemand) continue;
      out.push({ a, b, demand });
    }
  }
  return out.sort((x, y) => y.demand - x.demand || cmp(marketKey(x.a.id, x.b.id), marketKey(y.a.id, y.b.id))).slice(0, 14);
}

/** Quarterly route entries: evaluate candidate markets with a noisy profit estimate and enter the best ones. */
function considerEntries(ctx: RivalCtx, air: RivalAirline, rivals: RivalsState, sink: Sink, maxNew: number, relaxed: boolean) {
  const spec = ARCHETYPES[air.archetype];
  if (air.routes.length >= spec.maxRoutes) return;
  const all = marketIndex(rivals);
  const scored: { a: Airport; b: Airport; plan: NonNullable<ReturnType<typeof planEntry>>; est: number; margin: number }[] = [];
  for (const c of candidatePairs(ctx, air)) {
    const plan = planEntry(ctx, air, all, c.a, c.b);
    if (!plan) continue;
    let best: { est: number; margin: number; freq: number } | null = null;
    const freqs = plan.freq > spec.minFrequency ? [plan.freq, spec.minFrequency] : [plan.freq];
    for (const f of freqs) {
      const e = estimateEntry(ctx, air, all, c.a, c.b, plan.t, f, plan.fare);
      if (e && (!best || e.est > best.est)) best = { est: e.est, margin: e.estMargin, freq: f };
    }
    if (best) scored.push({ a: c.a, b: c.b, plan: { ...plan, freq: best.freq }, est: best.est, margin: best.margin });
  }
  scored.sort((x, y) => y.est - x.est || cmp(marketKey(x.a.id, x.b.id), marketKey(y.a.id, y.b.id)));
  let entered = 0;
  for (const s of scored) {
    if (entered >= maxNew || air.routes.length >= spec.maxRoutes) break;
    const ok = relaxed ? s.est > 0 : s.est >= spec.minEntryProfitPerWeek && s.margin >= spec.minEntryMargin;
    if (!ok) continue;
    const route = makeRoute(ctx, air, s.a, s.b, s.plan.t, s.plan.freq, s.plan.fare);
    air.routes.push(route);
    if (!relaxed && !canAffordGrowth(air, ctx)) { air.routes.pop(); air.nextRoute--; continue; }
    for (const [typeId, n] of shortfall(air, ctx)) acquire(air, ctx, typeId, n);
    openRoute(ctx, air, route, rivals, sink);
    entered++;
  }
}

/** Common bookkeeping when a route opens: memory, news and incumbents' reaction. */
function openRoute(ctx: RivalCtx, air: RivalAirline, route: RivalRoute, rivals: RivalsState, sink: Sink) {
  const key = marketKey(route.origin, route.destination);
  air.memory[key] ??= quietMemory(ctx, "self");
  const typeName = ctx.types.get(route.typeId)?.name ?? route.typeId;
  emit(ctx, sink, air, "enter", `${air.name} launches ${route.origin}-${route.destination}, ${route.frequency}/wk with ${typeName}.`, {
    origin: route.origin, destination: route.destination, frequency: route.frequency, typeId: route.typeId,
  });
  for (const other of rivals.airlines) {
    if (other === air || other.status !== "active") continue;
    for (const r of other.routes) {
      if (marketKey(r.origin, r.destination) !== key) continue;
      startEpisode(ctx, other, key, r, air.id, route.fare, true);
    }
  }
}

function startEpisode(ctx: RivalCtx, air: RivalAirline, key: string, route: RivalRoute, aggressor: string, fare: number, force: boolean) {
  const spec = ARCHETYPES[air.archetype];
  const mem = air.memory[key];
  if (!force && mem && (mem.active || ctx.day < mem.nextEpisodeDay)) return;
  if (mem?.active) { mem.aggressor = aggressor; mem.aggressorFare = fare; mem.untilDay = Math.max(mem.untilDay, ctx.day + spec.memoryDays); return; }
  if (mem && ctx.day < mem.nextEpisodeDay) return;
  air.memory[key] = {
    sinceDay: ctx.day, untilDay: ctx.day + spec.memoryDays, maxUntilDay: ctx.day + 2 * spec.memoryDays,
    aggressor, aggressorFare: fare, active: true, nextEpisodeDay: ctx.day + 2 * spec.memoryDays + spec.cooldownDays,
  };
  route.baselineFrequency = route.frequency;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

function newAirline(ctx: RivalCtx, id: string, name: string, archetype: Archetype, bases: string[], cash: number): RivalAirline {
  return {
    id, name, archetype, bases, status: "active", foundedDay: ctx.day, bankruptDay: null, cash, initialCash: cash,
    fleet: [], routes: [], memory: {}, exitedUntil: {}, playerSeen: [...ctx.player.keys()], optimism: gauss(ctx.rng) * RP.optimismStd, lossWeeks: 0, negCashWeeks: 0,
    lastWeekProfit: 0, profit52: [], nextAircraft: 0, nextRoute: 0,
  };
}

export function makeContext(
  airports: ReadonlyMap<string, Airport>, types: ReadonlyMap<string, AircraftType>, day: Day, rng: () => number,
  playerRoutes: readonly Route[], opFraction: (id: Id) => number = () => 1, seatsOf: (r: Route) => number = () => 0,
): RivalCtx {
  const player = new Map<string, { route: Route; seatsPerFlight: number; frequency: number }>();
  for (const r of playerRoutes) {
    const t = types.get(r.typeId);
    const seats = seatsOf(r) || (t ? Math.floor(t.maxSeats * 0.86) : 0);
    player.set(marketKey(r.origin, r.destination), { route: r, seatsPerFlight: seats, frequency: r.weeklyFrequency * opFraction(r.id) });
  }
  return { airports, types, day, year: dayToDate(day).year, rng, player };
}

/** Build the 2015 field. Deterministic in `seed`. */
export function createRivals(
  airports: readonly Airport[], types: readonly AircraftType[], seed: number, playerRoutes: readonly Route[] = [], day: Day = 0,
): RivalsState {
  const ctx = makeContext(new Map(airports.map((a) => [a.id, a])), new Map(types.map((t) => [t.id, t])), day, makeRng(mixSeed(seed, 0x21fa15)), playerRoutes);
  const state: RivalsState = { airlines: [], news: [], launchedEntrants: [], nextAirline: 0 };
  for (const spec of STARTING_RIVALS) {
    const air = newAirline(ctx, spec.id, spec.name, spec.archetype, spec.bases, spec.cash);
    const as = ARCHETYPES[spec.archetype];
    for (const [o, d, share] of spec.routes) {
      const a = ctx.airports.get(o);
      const b = ctx.airports.get(d);
      if (!a || !b) continue;
      const target = (share * sizingDemand(ctx, a, b)) / RP.targetLoadFactor;
      const t = chooseType(ctx, air, a, b, target);
      if (!t) continue;
      const bench = benchmarkFare(distanceKm(a, b));
      const freq = Math.min(as.maxFrequency, Math.max(4, Math.ceil(target / seatsFor(as, t))));
      air.routes.push(makeRoute(ctx, air, a, b, t, freq, bench * as.fareFactor));
      acquireForSetup(air, ctx);
      air.memory[marketKey(o, d)] = quietMemory(ctx, "self");
    }
    for (const r of air.routes) air.memory[marketKey(r.origin, r.destination)] ??= quietMemory(ctx, "self");
    state.airlines.push(air);
  }
  state.nextAirline = state.airlines.length;
  return state;
}

function acquireForSetup(air: RivalAirline, ctx: RivalCtx) {
  const spec = ARCHETYPES[air.archetype];
  for (const [typeId, n] of shortfall(air, ctx)) {
    for (let i = 0; i < n; i++) acquire(air, ctx, typeId, 1, (1 + ctx.rng() * (spec.maxAgeYears * 0.45)));
  }
}

// ---------------------------------------------------------------------------
// Weekly step
// ---------------------------------------------------------------------------

export interface RivalStepResult {
  rivals: RivalsState;
  bankruptcies: BankruptcyRecord[];
  notices: SimEvent[];
}

function launchAirline(
  ctx: RivalCtx, rivals: RivalsState, sink: Sink, spec: Pick<EntrantSpec, "id" | "name" | "archetype" | "bases" | "cash" | "initialRoutes">,
) {
  const air = newAirline(ctx, spec.id, spec.name, spec.archetype, spec.bases, spec.cash);
  air.optimism += RP.startupOptimism;
  rivals.airlines.push(air);
  rivals.nextAirline++;
  emit(ctx, sink, air, "launch", `New airline ${air.name} (${ARCHETYPES[air.archetype].label.toLowerCase()}) launches from ${spec.bases.join("/")}.`);
  considerEntries(ctx, air, rivals, sink, spec.initialRoutes, true);
  for (const k of Object.keys(air.memory)) air.memory[k]!.nextEpisodeDay = ctx.day + 30;
}

function bankrupt(ctx: RivalCtx, air: RivalAirline, sink: Sink): BankruptcyRecord {
  const aircraft: Aircraft[] = air.fleet.map((f) => {
    const t = ctx.types.get(f.typeId)!;
    return {
      id: f.id, typeId: f.typeId, tailNumber: `N${f.id.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}`, layout: defaultLayout(t),
      status: "active", ageDays: f.ageDays, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 },
    };
  });
  const rec: BankruptcyRecord = {
    lotId: `lot-${air.id}`, airlineId: air.id, airlineName: air.name, archetype: air.archetype, day: ctx.day, aircraft,
    routes: air.routes.map((r) => ({ origin: r.origin, destination: r.destination, frequency: r.frequency, typeId: r.typeId })),
  };
  for (const r of air.routes) {
    emit(ctx, sink, air, "exit", `${air.name} withdraws from ${r.origin}-${r.destination} (ceasing operations).`, { origin: r.origin, destination: r.destination });
  }
  emit(ctx, sink, air, "bankrupt", `${air.name} has ceased operations; ${aircraft.length} aircraft are being released.`, { aircraft: aircraft.length });
  air.status = "bankrupt";
  air.bankruptDay = ctx.day;
  air.fleet = [];
  air.routes = [];
  air.memory = {};
  return rec;
}

/**
 * One weekly tick of every rival (call on days divisible by 7). Pure: clones the rival state.
 * `playerRoutes`/`opFraction`/`seatsOf` describe the player's current presence so rivals can see (and react to) it.
 */
export function stepRivalsWeek(
  input: RivalsState, ctx: RivalCtx, week: number, seed: number,
): RivalStepResult {
  const rivals = structuredClone(input);
  const sink: Sink = { news: [], notices: [] };
  const bankruptcies: BankruptcyRecord[] = [];

  // Scheduled entrants and (rare) random startups.
  for (const e of SCHEDULED_ENTRANTS) {
    if (rivals.launchedEntrants.includes(e.id)) continue;
    const jitter = Math.round((makeRng(mixSeed(seed, 0xe17a))() - 0.5) * 2 * e.jitterDays);
    if (ctx.day >= Math.round(e.launchYear * 365.25) + jitter) {
      rivals.launchedEntrants.push(e.id);
      launchAirline(ctx, rivals, sink, e);
    }
  }
  if (week > 0 && week % RP.yearWeeks === 0 && ctx.year >= RP.randomEntrantFromYear) {
    const active = rivals.airlines.filter((a) => a.status === "active").length;
    if (active < RP.maxActive && ctx.rng() < RP.randomEntrantChancePerYear) {
      const name = ENTRANT_NAME_POOL.find((n) => !rivals.airlines.some((a) => a.name === n));
      if (name) {
        const hubs = [...ctx.airports.values()].filter((a) => a.region === "CA" && a.metroPopulation > 900_000).sort((x, y) => cmp(x.id, y.id));
        const pick = hubs[Math.floor(ctx.rng() * hubs.length)]!;
        const pick2 = hubs[Math.floor(ctx.rng() * hubs.length)]!;
        launchAirline(ctx, rivals, sink, {
          id: `startup-${rivals.nextAirline}`, name, archetype: "lcc", bases: [...new Set([pick.id, pick2.id])], cash: RP.entrantCash, initialRoutes: 3,
        });
      }
    }
  }

  // 1. Market evaluation for every rival route, once.
  const all = marketIndex(rivals);
  const results = new Map<RivalRoute, RouteResult>();
  for (const [key, entries] of [...all.entries()].sort((x, y) => cmp(x[0], y[0]))) {
    const a = ctx.airports.get(entries[0]!.route.origin);
    const b = ctx.airports.get(entries[0]!.route.destination);
    if (!a || !b) continue;
    for (const [rt, res] of evaluateMarket(ctx, a, b, entries)) results.set(rt, res);
    void key;
  }

  rivals.airlines.forEach((air, idx) => {
    if (air.status !== "active") return;
    const spec = ARCHETYPES[air.archetype];

    // 2. Weekly P&L.
    let routeProfit = 0;
    for (const rt of air.routes) {
      const r = results.get(rt);
      if (!r) continue;
      routeProfit += r.profit - r.revenue * spec.indirectCostPct;
      const net = r.profit - r.ownership;
      rt.profitHist.push(net);
      if (rt.profitHist.length > 13) rt.profitHist.shift();
      rt.loadFactor = r.loadFactor;
      rt.revenue = r.revenue;
      rt.margin = r.revenue > 0 ? net / r.revenue : -1;
    }
    const profit = routeProfit - weeklyFixed(air, ctx);
    air.cash += profit;
    air.lastWeekProfit = profit;
    air.profit52.push(profit);
    if (air.profit52.length > 52) air.profit52.shift();
    air.lossWeeks = profit < 0 ? air.lossWeeks + 1 : 0;
    air.negCashWeeks = air.cash < 0 ? air.negCashWeeks + 1 : 0;
    for (const f of air.fleet) f.ageDays += 7;

    // 3. Weekly pricing and memory.
    for (const rt of air.routes) updatePricing(ctx, sink, air, rt, all, spec);

    const isMonth = week > 0 && (week + idx) % RP.monthWeeks === 0;
    const isQuarter = week > 0 && (week + 2 * idx) % RP.quarterWeeks === 0;
    const isYear = week > 0 && (week + 7 * idx) % RP.yearWeeks === 0;

    // 4. Monthly: frequency, shrink, dividends.
    if (isMonth) monthly(ctx, sink, air, spec);
    // 5. Quarterly: exits then entries.
    if (isQuarter) {
      quarterlyExits(ctx, sink, air, rivals, spec);
      if (air.cash > 0) considerEntries(ctx, air, rivals, sink, RP.entriesPerQuarter, air.routes.length < 2);
    }
    // 6. Annual: fleet.
    if (isYear) annualFleet(ctx, sink, air, spec);
  });

  // 7. Insolvency.
  for (const air of rivals.airlines) {
    if (air.status !== "active") continue;
    if (air.negCashWeeks >= RP.bankruptNegCashWeeks || air.cash < -Math.max(air.initialCash, RP.bankruptDeepWeeksOfCost * weeklyFixed(air, ctx))) {
      bankruptcies.push(bankrupt(ctx, air, sink));
    }
  }

  rivals.news = [...rivals.news, ...sink.news].slice(-RP.newsLimit);
  return { rivals, bankruptcies, notices: sink.notices };
}

function updatePricing(ctx: RivalCtx, sink: Sink, air: RivalAirline, rt: RivalRoute, all: Map<string, Entry[]>, spec: ArchetypeSpec) {
  const key = marketKey(rt.origin, rt.destination);
  const a = ctx.airports.get(rt.origin)!;
  const b = ctx.airports.get(rt.destination)!;
  const bench = benchmarkFare(distanceKm(a, b));
  const mySeats = rt.frequency * rt.seatsPerFlight;
  // Competitors with a meaningful share of seats.
  let low: number | null = null;
  let lowWho = "";
  for (const e of all.get(key) ?? []) {
    if (e.air === air) continue;
    if (e.route.frequency * e.route.seatsPerFlight < RP.undercutMinSeatShare * mySeats) continue;
    if (low === null || e.route.fare < low) { low = e.route.fare; lowWho = e.air.id; }
  }
  const pl = ctx.player.get(key);
  if (pl && pl.frequency * pl.seatsPerFlight >= RP.undercutMinSeatShare * mySeats && (low === null || pl.route.fares.Y < low)) {
    low = pl.route.fares.Y; lowWho = "player";
  }

  let mem = air.memory[key];
  if (!mem) mem = air.memory[key] = quietMemory(ctx, "self");
  // First sight of the player in this market counts as an entry; a player already present at set-up does not.
  if (pl && !air.playerSeen.includes(key)) {
    air.playerSeen.push(key);
    if (pl.frequency * pl.seatsPerFlight >= RP.undercutMinSeatShare * mySeats) startEpisode(ctx, air, key, rt, "player", pl.route.fares.Y, true);
    mem = air.memory[key]!;
  } else if (!pl && air.playerSeen.includes(key)) {
    air.playerSeen = air.playerSeen.filter((k) => k !== key);
  }
  const undercut = low !== null && low < rt.baseFare * (1 - RP.undercutThreshold);
  if (mem.active) {
    if (undercut && ctx.day > mem.untilDay - 7 && mem.untilDay < mem.maxUntilDay) mem.untilDay = Math.min(mem.maxUntilDay, mem.untilDay + 7);
    if (low !== null) mem.aggressorFare = low;
    if (ctx.day > mem.untilDay) mem.active = false;
  } else if (undercut && ctx.day >= mem.nextEpisodeDay) {
    startEpisode(ctx, air, key, rt, lowWho, low!, false);
    mem = air.memory[key]!;
  }

  if (mem.active) {
    const floor = Math.max(bench * spec.floorFareFactor, rt.baseFare * (1 - spec.maxFareCut));
    let target = low !== null ? Math.min(rt.baseFare, low * spec.matchFactor) : rt.baseFare;
    target = Math.max(target, floor);
    rt.fare += (target - rt.fare) * RP.fareStepPerWeek;
  } else {
    // Yield management on the base fare, then relax toward it.
    const lf = rt.loadFactor;
    if (rt.profitHist.length >= 2) {
      if (lf > RP.yieldHighLF) rt.baseFare *= 1 + RP.yieldUp;
      else if (lf < RP.yieldLowLF) rt.baseFare *= 1 - RP.yieldDown;
      rt.baseFare = Math.min(bench * spec.fareFactor * RP.fareCeiling, Math.max(bench * spec.floorFareFactor * 1.05, rt.baseFare));
    }
    rt.fare = rt.fare < rt.baseFare ? Math.min(rt.baseFare, rt.fare * (1 + RP.relaxPerWeek)) : rt.baseFare;
  }

  if (rt.fare > rt.announcedFare) rt.announcedFare = rt.fare;
  const pct = 1 - rt.fare / rt.announcedFare;
  if (pct >= RP.announceCutPct && ctx.day - rt.lastNoticeDay >= RP.announceCooldownDays) {
    const p = Math.round(pct * 100);
    emit(ctx, sink, air, "fareCut", `${air.name} cut ${rt.origin}-${rt.destination} fares ${p}%.`, {
      origin: rt.origin, destination: rt.destination, pct: p,
    });
    rt.announcedFare = rt.fare;
    rt.lastNoticeDay = ctx.day;
  }
}

function monthly(ctx: RivalCtx, sink: Sink, air: RivalAirline, spec: ArchetypeSpec) {
  // Dividends keep cash bounded.
  const cap = air.initialCash * RP.dividendCapMultiple;
  if (air.cash > cap) air.cash -= (air.cash - cap) * RP.dividendShare;

  const fixed = weeklyFixed(air, ctx);
  const distressed = (air.cash < RP.distressWeeksOfCost * fixed && air.lossWeeks >= 8) || air.lossWeeks >= RP.distressLossWeeks;
  if (distressed) {
    // Staying power is finite: cut the worst routes and hand back the aircraft.
    const losers = air.routes
      .filter((r) => r.profitHist.length >= 4)
      .map((r) => ({ r, avg: r.profitHist.slice(-4).reduce((s, x) => s + x, 0) / Math.min(4, r.profitHist.length) }))
      .filter((x) => x.avg < 0)
      .sort((x, y) => x.avg - y.avg || cmp(x.r.id, y.r.id))
      .slice(0, RP.shrinkRoutesPerMonth);
    for (const { r } of losers) {
      air.routes = air.routes.filter((x) => x !== r);
      air.exitedUntil[marketKey(r.origin, r.destination)] = ctx.day + RP.reentryCooldownDays;
      emit(ctx, sink, air, "exit", `${air.name} withdraws from ${r.origin}-${r.destination}.`, { origin: r.origin, destination: r.destination });
    }
    const released = releaseSurplus(air, ctx);
    if (losers.length > 0 || released > 0) {
      emit(ctx, sink, air, "shrink", `${air.name} is cutting back: ${losers.length} route(s) closed, ${released} aircraft returned.`, { aircraft: released });
    }
    return;
  }

  for (const rt of air.routes) {
    if (ctx.day - rt.enteredDay < 56) continue;
    const lf = rt.loadFactor * (1 + gauss(ctx.rng) * 0.03);
    const margin = rt.margin + gauss(ctx.rng) * spec.estimateNoise * 0.5;
    const mem = air.memory[marketKey(rt.origin, rt.destination)];
    const before = rt.frequency;
    if (spec.freqResponse && mem?.active && rt.frequency < rt.baselineFrequency * 1.35 && rt.frequency < spec.maxFrequency) {
      rt.frequency += Math.max(1, Math.round(rt.frequency * 0.1));
      if (!canAffordGrowth(air, ctx)) rt.frequency = before;
    } else if (lf >= RP.growLF && margin >= RP.growMargin && rt.frequency < spec.maxFrequency && !mem?.active) {
      rt.frequency = Math.min(spec.maxFrequency, rt.frequency + Math.max(1, Math.round(rt.frequency * (lf > 0.95 ? 0.25 : 0.12))));
      if (!canAffordGrowth(air, ctx)) rt.frequency = before;
    } else if ((lf <= RP.shrinkLF || margin <= RP.shrinkMargin) && rt.frequency > spec.minFrequency) {
      rt.frequency = Math.max(spec.minFrequency, rt.frequency - Math.max(1, Math.round(rt.frequency * 0.12)));
    }
    if (rt.frequency !== before) {
      const pct = Math.round((Math.abs(rt.frequency - before) / before) * 100);
      emit(ctx, sink, air, "frequency", `${air.name} ${rt.frequency > before ? "adds" : "cuts"} ${rt.origin}-${rt.destination} to ${rt.frequency}/wk.`, {
        origin: rt.origin, destination: rt.destination, pct, frequency: rt.frequency,
      });
    }
  }
  for (const [typeId, n] of shortfall(air, ctx)) acquire(air, ctx, typeId, n);
}

function quarterlyExits(ctx: RivalCtx, sink: Sink, air: RivalAirline, _rivals: RivalsState, spec: ArchetypeSpec) {
  for (const rt of [...air.routes]) {
    if (ctx.day - rt.enteredDay < RP.minRouteAgeWeeks * 7 || rt.profitHist.length < 8) continue;
    const avg = rt.profitHist.reduce((s, x) => s + x, 0) / rt.profitHist.length;
    const estMargin = avg / Math.max(1, rt.revenue) + air.optimism + gauss(ctx.rng) * spec.estimateNoise * 0.6;
    rt.badQuarters = estMargin < RP.exitMargin ? rt.badQuarters + 1 : 0;
    if (rt.badQuarters >= RP.exitQuarters && air.routes.length > 1) {
      air.routes = air.routes.filter((x) => x !== rt);
      air.exitedUntil[marketKey(rt.origin, rt.destination)] = ctx.day + RP.reentryCooldownDays;
      emit(ctx, sink, air, "exit", `${air.name} withdraws from ${rt.origin}-${rt.destination}.`, { origin: rt.origin, destination: rt.destination });
    }
  }
  releaseSurplus(air, ctx);
}

function annualFleet(ctx: RivalCtx, sink: Sink, air: RivalAirline, spec: ArchetypeSpec) {
  // Retire the oldest aircraft past the age limit and lease a modern replacement if cash allows.
  const old = air.fleet.filter((f) => f.ageDays / 365 > spec.maxAgeYears).sort((x, y) => y.ageDays - x.ageDays || cmp(x.id, y.id));
  for (const f of old) {
    air.fleet = air.fleet.filter((x) => x !== f);
    air.cash += RP.depositMonths * monthlyLease(ctx.types.get(f.typeId)!);
    // Move routes to a type that is still available.
    for (const rt of air.routes) {
      if (rt.typeId !== f.typeId) continue;
      const t = ctx.types.get(rt.typeId)!;
      if (typeAvailable(t, ctx.year, true) && (t.endYear === null || t.endYear >= ctx.year - 14)) continue;
      const a = ctx.airports.get(rt.origin)!;
      const b = ctx.airports.get(rt.destination)!;
      const nt = chooseType(ctx, air, a, b, rt.frequency * rt.seatsPerFlight);
      if (nt && nt.id !== rt.typeId) {
        rt.typeId = nt.id;
        rt.seatsPerFlight = seatsFor(spec, nt);
        rt.frequency = Math.max(spec.minFrequency, Math.round((rt.frequency * seatsFor(spec, t)) / rt.seatsPerFlight));
      }
    }
  }
  if (air.cash > spec.reserveWeeks * weeklyFixed(air, ctx)) {
    for (const [typeId, n] of shortfall(air, ctx)) acquire(air, ctx, typeId, n, 0);
  } else {
    // Cannot fund replacements: shed what cannot be flown.
    for (const [typeId, n] of shortfall(air, ctx)) {
      let left = n;
      for (const rt of [...air.routes].filter((r) => r.typeId === typeId).sort((x, y) => (x.profitHist.at(-1) ?? 0) - (y.profitHist.at(-1) ?? 0))) {
        if (left <= 0) break;
        air.routes = air.routes.filter((x) => x !== rt);
        left--;
      }
    }
  }
  const released = releaseSurplus(air, ctx);
  if (old.length > 0 || released > 0) void sink;
}

// ---------------------------------------------------------------------------
// Hook for the player route model
// ---------------------------------------------------------------------------

/** Modelled direct rival itineraries for a pair, or undefined when no rival serves it (synthetic fallback applies). */
export function rivalItinerariesFor(
  rivals: RivalsState | null | undefined, a: Airport, b: Airport, types: ReadonlyMap<string, AircraftType>,
): Itinerary[] | undefined {
  if (!rivals) return undefined;
  const dist = distanceKm(a, b);
  const key = marketKey(a.id, b.id);
  let out: Itinerary[] | undefined;
  for (const air of rivals.airlines) {
    if (air.status !== "active") continue;
    for (const rt of air.routes) {
      if (marketKey(rt.origin, rt.destination) !== key) continue;
      const t = types.get(rt.typeId);
      if (!t) continue;
      (out ??= []).push(rivalItinerary(air, rt, dist, t));
    }
  }
  return out;
}
