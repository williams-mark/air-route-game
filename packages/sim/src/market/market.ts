// Company valuations, takeover bids and mergers (owner request, 26 Nov 2026). Pure and seeded.
//
// Valuation (a simple equity model, game-design figures, not data): cash + the resale value of aircraft owned outright + a multiple of
// trailing twelve-month profit (a smaller multiple when it is a loss), never below a floor of a share of the hard assets. The player
// and every competitor are valued the same way; the player sees competitors' values as market estimates (their accounts stay hidden).
//
// Bids: the player may offer for a competitor. Its board accepts at or above a reservation price (value x premium, with a little
// month-to-month noise; distressed airlines sell near value). Accepted: the player pays, takes over the airline's cash (or debt),
// aircraft (owned outright, based at its hubs), bases (as hubs) and routes. Competitors may also offer for the player; accepting
// merges the bidder into the player's airline (the player runs the combined company, under the bidder's name) and pays the price to the
// player's shareholders (a score); declining makes the bidder hostile for a year (it targets the player's markets, rivals/engine.ts).
// Competitors also consolidate among themselves: a strong airline buys a failing one nearby, so the field grows larger airlines.
import type { Aircraft, AircraftType, Day, Id, Route, SimEvent } from "@arg/contracts";
import { usdM } from "../money";
import { distanceKm } from "../geo";
import { makeRng, mixSeed } from "../rng";
import type { SimState } from "../state";
import type { RivalAirline, RivalNewsItem, RivalsState } from "../rivals/types";
import { ARCHETYPES } from "../rivals/config";
import { aircraftBookValueUsd, creditLimitUsd } from "../finance/credit";
import { saleValueUsd, holdingOf } from "../fleet/disposal";
import { DISPOSAL_PARAMS } from "../fleet/lifecycle";
import { ownedHubsOf } from "../fleet/hubs";
import { defaultLayout } from "../fleet/layout";
import { initialMeta } from "../fleet/maintenance";
import { airportOpen } from "../world/closures";
import { dayToDate } from "../time/calendar";
import { dayLabel } from "../world/closures";
import type { BidRecord, IncomingBid, MarketState, ValuationPoint } from "./types";

export const MARKET_PARAMS = {
  earningsMultiple: 7,
  lossMultiple: 2,
  /** Floor: this share of cash (if positive) plus aircraft value. */
  floorFraction: 0.15,
  /** Board's reservation price: value x premium x (1 +- noise). */
  premium: 1.3,
  distressedPremium: 1.05,
  boardNoise: 0.08,
  rejectCooldownDays: 60,
  acquisitionCooldownDays: 180,
  /** Competitors' offers for the player. */
  offerExpiryDays: 30,
  offerMinValueRatio: 1.5,
  /** Bidders are at most this many times the player's value: a merger of near-peers, not a giant swallowing a minnow (playtest: accepting a 100x bidder made the player the largest airline overnight). */
  offerMaxValueRatio: 4,
  /** One-off integration cost of any merger (systems, liveries, labour agreements), as a share of the acquired airline's annual revenue. Game-design value. */
  integrationShareOfRevenue: 0.08,
  offerChancePerMonth: 0.015,
  offerChanceWeak: 0.05,
  /** After any offer for the player (accepted, declined or lapsed), no new one for this many days. */
  offerCooldownDays: 365,
  offerPremium: [1.2, 1.5] as const,
  hostileDays: 365,
  /** Consolidation among competitors, checked each quarter for every failing airline. */
  consolidationChance: 0.35,
  consolidationMaxKm: 4500,
  historyMax: 360,
} as const;

export interface Valuation {
  valueUsd: number;
  cashUsd: number;
  fleetUsd: number;
  /** Trailing twelve-month profit (annualised when the airline is younger), USD. */
  earningsUsd: number;
  /** What the earnings add to the value (multiple x earnings), USD. */
  earningsPartUsd: number;
}

const value = (cash: number, fleet: number, earnings: number): Valuation => {
  const P = MARKET_PARAMS;
  const earningsPartUsd = earnings >= 0 ? P.earningsMultiple * earnings : P.lossMultiple * earnings;
  const floor = P.floorFraction * (Math.max(0, cash) + fleet);
  return { valueUsd: Math.max(floor, cash + fleet + earningsPartUsd), cashUsd: cash, fleetUsd: fleet, earningsUsd: earnings, earningsPartUsd };
};

export function playerValuation(state: SimState): Valuation {
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  let fleet = 0;
  for (const ac of state.world.fleet) {
    if (ac.status === "delivery") continue;
    const t = types.get(ac.typeId);
    if (t && holdingOf(state, ac) === "purchase") fleet += saleValueUsd(state, ac, t);
  }
  return value(state.world.cash, fleet, smoothedEarnings(state.snapshots.map((x) => x.profit), 365));
}

/** Resale value of one aircraft on the same basis as the player's `saleValueUsd` (book x dealer factor x widebody haircut). */
export const resaleUsd = (t: AircraftType, ageDays: number): number => aircraftBookValueUsd(t, ageDays) * DISPOSAL_PARAMS.marketFactor * (t.widebody ? DISPOSAL_PARAMS.widebodyFactor : 1);

/**
 * A competitor's value. `originDay` is the day the field was founded (RivalsState.originDay): airlines founded later (startups) are
 * young and their first months' profit is weighted like the player's; airlines that were flying before the game are valued on their
 * annualised profit straight away (they did not start from nothing on day one).
 */
export function rivalValuation(air: RivalAirline, types: ReadonlyMap<Id, AircraftType>, originDay?: number): Valuation {
  let fleet = 0;
  for (const f of air.fleet) { const t = types.get(f.typeId); if (t) fleet += resaleUsd(t, f.ageDays); }
  const young = originDay !== undefined && air.foundedDay > originDay;
  return value(air.cash, fleet, smoothedEarnings(air.profit52, 52, young));
}

/**
 * Annual earnings the valuation uses, from per-period profits (oldest first; `perYear` periods a year). Two steps keep the value
 * from jumping: a young airline's annualised profit is weighted by how much of a year it has behind it (one good first month does not
 * count as a year), and the latest year is blended half-and-half with the year before when there is one.
 */
export function smoothedEarnings(profits: readonly number[], perYear: number, young = true): number {
  const n = profits.length;
  if (n === 0) return 0;
  const last = profits.slice(-perYear);
  const annual = (last.reduce((s, x) => s + x, 0) / last.length) * perYear * (young ? Math.min(1, last.length / perYear) : 1);
  const prior = n >= 2 * perYear ? profits.slice(-2 * perYear, -perYear) : null;
  return prior ? 0.5 * annual + 0.5 * prior.reduce((s, x) => s + x, 0) : annual;
}

const typeMap = (state: SimState) => new Map(state.aircraftTypes.map((t) => [t.id, t]));
const hashId = (id: string) => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return h >>> 0; };
const monthOf = (day: Day) => { const d = dayToDate(day); return d.year * 12 + d.month; };
export const isDistressed = (air: RivalAirline) => air.cash < 0 || air.lossWeeks >= 8;

/** The price at which a competitor's board accepts an offer this month (hidden from the player). */
export function reservationPriceUsd(state: SimState, air: RivalAirline): number {
  const v = rivalValuation(air, typeMap(state), state.rivals?.originDay ?? 0).valueUsd;
  const prem = isDistressed(air) ? MARKET_PARAMS.distressedPremium : MARKET_PARAMS.premium;
  const noise = (makeRng(mixSeed(state.world.seed, hashId(air.id) ^ monthOf(state.world.day)))() - 0.5) * 2 * MARKET_PARAMS.boardNoise;
  return v * prem * (1 + noise);
}

/** A rough guide price the player can see: the market estimate times the usual premium, rounded. */
export function guidePriceUsd(state: SimState, air: RivalAirline): number {
  // The board's asking price this month, rounded up to three significant figures: an offer at the guide price is accepted.
  return ceilSig(reservationPriceUsd(state, air));
}
const roundSig = (x: number) => { if (x <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; };
const ceilSig = (x: number) => { if (x <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(x)) - 2); return Math.ceil(x / p) * p; };

/** Day from which the player may make another offer for this airline (cool-down after a rejection or a purchase); null = now. */
export function nextBidDay(state: SimState, air: RivalAirline): Day | null {
  const m = marketOf(state);
  const own = m.cooldown[air.id] ?? -Infinity;
  const last = [...m.bids].reverse().find((b) => b.outcome === "accepted");
  const after = last ? last.day + MARKET_PARAMS.acquisitionCooldownDays : -Infinity;
  const d = Math.max(own, after);
  return d > state.world.day ? d : null;
}

/** What buying `air` at `priceUsd` would do: cash change, what joins, distance from the player's network. */
export interface DealPreview { priceUsd: number; targetCashUsd: number; integrationUsd: number; netCashUsd: number; cashAfterUsd: number; aircraft: number; fleetValueUsd: number; routes: number; bases: Id[]; valueUsd: number; valueChangeUsd: number; nearestBaseKm: number | null }
export function dealPreview(state: SimState, air: RivalAirline, priceUsd: number): DealPreview {
  const v = rivalValuation(air, typeMap(state), state.rivals?.originDay ?? 0);
  const bases = ownedHubsOf(state).concat(state.outstations ?? []);
  const hub = state.airports.find((a) => a.id === air.bases[0]);
  const near = hub ? Math.min(...bases.map((b) => { const ap = state.airports.find((a) => a.id === b); return ap ? distanceKm(hub, ap) : Infinity; })) : Infinity;
  return {
    priceUsd, targetCashUsd: air.cash, integrationUsd: integrationCostUsd(air), netCashUsd: air.cash - priceUsd - integrationCostUsd(air), cashAfterUsd: state.world.cash + air.cash - priceUsd - integrationCostUsd(air),
    aircraft: air.fleet.length, fleetValueUsd: v.fleetUsd, routes: air.routes.length, bases: air.bases, valueUsd: v.valueUsd,
    valueChangeUsd: v.valueUsd - priceUsd, nearestBaseKm: Number.isFinite(near) ? near : null,
  };
}

export const emptyMarket = (): MarketState => ({ history: [], incoming: [], bids: [], hostileUntil: {}, cooldown: {}, payoutUsd: 0, merged: [], nextBid: 1 });
export const marketOf = (s: SimState): MarketState => s.market ?? emptyMarket();

/** "Fable Skies'" and "Lantern Jet's". */
export const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

const say = (state: SimState, text: string): SimEvent => ({ kind: "notice", day: state.world.day, text });
const pushNotices = (state: SimState, events: SimEvent[]): SimState =>
  events.length === 0 ? state : { ...state, pendingEvents: [...state.pendingEvents, ...events].slice(-state.params.eventQueueLimit) };

/** Why the player cannot buy this airline now, or null. */
export function bidRefusal(state: SimState, air: RivalAirline | undefined, priceUsd: number): string | null {
  if (!air) return "There is no such airline.";
  if (air.status !== "active") return `${air.name} is no longer trading.`;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return "Enter a price above zero.";
  const m = marketOf(state);
  const until = m.cooldown[air.id] ?? -Infinity;
  if (state.world.day < until) return `${possessive(air.name)} board will not look at another offer before ${Math.ceil(until - state.world.day)} more days have passed.`;
  const last = [...m.bids].reverse().find((b) => b.outcome === "accepted");
  if (last && state.world.day - last.day < MARKET_PARAMS.acquisitionCooldownDays) {
    return `You are still integrating ${last.rivalName}. Your next acquisition is possible in ${MARKET_PARAMS.acquisitionCooldownDays - (state.world.day - last.day)} days.`;
  }
  const limit = creditLimitUsd(state);
  if (state.world.cash - priceUsd < -limit) return `Paying ${usdM(priceUsd)} would take cash to ${usdM(state.world.cash - priceUsd)}, beyond your ${usdM(limit)} credit line.`;
  return null;
}

/** The player offers `priceUsd` for a competitor. */
export function bidForAirline(state: SimState, airlineId: Id, priceUsd: number): { state: SimState; ok: boolean; message: string } {
  const air = state.rivals?.airlines.find((a) => a.id === airlineId);
  const refusal = bidRefusal(state, air, priceUsd);
  if (refusal || !air) return { state, ok: false, message: refusal ?? "There is no such airline." };
  const m = marketOf(state);
  const reserve = reservationPriceUsd(state, air);
  if (priceUsd < reserve) {
    const hint = ceilSig(reserve);
    const rec: BidRecord = { day: state.world.day, rivalId: air.id, rivalName: air.name, priceUsd, outcome: "rejected", hintUsd: hint };
    const text = `${possessive(air.name)} board rejected your offer of ${usdM(priceUsd)}. Its asking price this month is ${usdM(hint)} (it moves a little each month). You can offer again from ${dayLabel(state.world.day + MARKET_PARAMS.rejectCooldownDays)}.`;
    const next: SimState = { ...state, market: { ...m, bids: [...m.bids, rec], cooldown: { ...m.cooldown, [air.id]: state.world.day + MARKET_PARAMS.rejectCooldownDays } } };
    return { state: pushNotices(next, [say(state, text)]), ok: false, message: text };
  }
  const merged = absorbRival(state, air, priceUsd);
  const m2 = marketOf(merged);
  const rec: BidRecord = { day: state.world.day, rivalId: air.id, rivalName: air.name, priceUsd, outcome: "accepted" };
  const text = `You bought ${air.name} for ${usdM(priceUsd)}: ${air.fleet.length} aircraft, ${air.routes.length} routes and its bases (${air.bases.join(", ")}) join your airline.`;
  const next: SimState = { ...merged, market: { ...m2, bids: [...m2.bids, rec], merged: [...m2.merged, { day: state.world.day, name: air.name, viaOffer: false }] } };
  return { state: pushNotices(next, [say(state, text)]), ok: true, message: text };
}

/** Accept or decline a competitor's offer for the player's airline. */
export function respondToBid(state: SimState, bidId: Id, accept: boolean, keepName = false): { state: SimState; ok: boolean; message: string } {
  const m = marketOf(state);
  const bid = m.incoming.find((b) => b.id === bidId);
  if (!bid) return { state, ok: false, message: "That offer is no longer open." };
  const air = state.rivals?.airlines.find((a) => a.id === bid.rivalId);
  const rest = m.incoming.filter((b) => b.id !== bidId);
  if (!accept || !air || air.status !== "active") {
    const text = air && air.status === "active"
      ? `You turned down ${possessive(bid.rivalName)} offer of ${usdM(bid.priceUsd)}. Expect it to compete harder in your markets for a year.`
      : `${possessive(bid.rivalName)} offer has lapsed.`;
    const hostileUntil = air && air.status === "active" ? { ...m.hostileUntil, [air.id]: state.world.day + MARKET_PARAMS.hostileDays } : m.hostileUntil;
    return { state: pushNotices({ ...state, market: { ...m, incoming: rest, hostileUntil } }, [say(state, text)]), ok: true, message: text };
  }
  const oldName = state.airlineName;
  // The bidder pays the price out of its own cash: the combined airline starts with both airlines' cash less the price paid to your
  // shareholders (playtest, 26 Nov 2026: without this, a failing airline that sold itself inherited the buyer's whole cash pile).
  const merged = absorbRival({ ...state, market: { ...m, incoming: [] } }, air, bid.priceUsd);
  const m2 = marketOf(merged);
  // The campaign grade measures what you build: the buyer's net assets (its cash and aircraft, less the price) raise the baseline.
  const t = rivalValuation(air, typeMap(state), state.rivals?.originDay ?? 0);
  const broughtIn = t.cashUsd + t.fleetUsd - bid.priceUsd;
  const campaign = merged.campaign ? { ...merged.campaign, startCashUsd: Math.max(1, merged.campaign.startCashUsd + broughtIn) } : merged.campaign;
  const name = keepName ? oldName : air.name;
  const text = keepName
    ? `You merged with ${air.name}; the combined company keeps the ${oldName} name and you run it. ${usdM(bid.priceUsd)} went to your shareholders out of the combined cash; its ${air.fleet.length} aircraft and ${air.routes.length} routes join yours.`
    : `${air.name} has bought ${oldName} for ${usdM(bid.priceUsd)}, paid to your shareholders out of the combined company's cash. You run the combined airline, now called ${air.name}: its ${air.fleet.length} aircraft and ${air.routes.length} routes join yours.`;
  const next: SimState = { ...merged, airlineName: name, ...(campaign ? { campaign } : {}), market: { ...m2, payoutUsd: m2.payoutUsd + bid.priceUsd, merged: [...m2.merged, { day: state.world.day, name: air.name, viaOffer: true }] } };
  return { state: pushNotices(next, [say(state, text)]), ok: true, message: text };
}

/**
 * Merge a competitor into the player's airline: pay `paidUsd`, take its cash (or debt), its aircraft (owned outright, based at its hub),
 * its bases (as hubs) and its routes (a market the player already flies gets the extra frequency). The competitor stops trading.
 */
export function absorbRival(state: SimState, air: RivalAirline, paidUsd: number): SimState {
  const types = typeMap(state);
  const rng = makeRng(mixSeed(state.world.seed, hashId(air.id) ^ 0x6d72));
  const hub = air.bases[0]!;
  let nAc = state.counters.aircraft;
  const fleetMeta = { ...state.fleetMeta };
  const newAircraft: Aircraft[] = [];
  for (const f of air.fleet) {
    const t = types.get(f.typeId);
    if (!t) continue;
    nAc += 1;
    const ac: Aircraft = {
      id: `ac-${nAc}`, typeId: f.typeId, tailNumber: `${air.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "MG"}-${String(nAc).padStart(3, "0")}`,
      layout: defaultLayout(t), status: "active", ageDays: f.ageDays, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 }, hubId: hub, financing: "purchase",
    };
    newAircraft.push(ac);
    fleetMeta[ac.id] = initialMeta(ac, rng);
  }
  let nRoute = state.counters.route;
  const routes: Route[] = state.world.routes.map((r) => ({ ...r }));
  const key = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const byKey = new Map(routes.map((r) => [key(r.origin, r.destination), r]));
  for (const rt of air.routes) {
    if (!airportOpen(rt.origin, state.world.day) || !airportOpen(rt.destination, state.world.day) || !types.has(rt.typeId)) continue;
    const have = byKey.get(key(rt.origin, rt.destination));
    if (have) { have.weeklyFrequency = Math.min(140, have.weeklyFrequency + rt.frequency); continue; }
    nRoute += 1;
    const r: Route = { id: `route-${nRoute}`, origin: rt.origin, destination: rt.destination, weeklyFrequency: Math.max(1, Math.min(140, Math.round(rt.frequency))), fares: { Y: Math.max(1, Math.round(rt.fare)) }, typeId: rt.typeId };
    routes.push(r);
    byKey.set(key(r.origin, r.destination), r);
  }
  const ownedHubs = [...new Set([...ownedHubsOf(state), ...air.bases])].sort();
  const integration = integrationCostUsd(air);
  const cash = state.world.cash - paidUsd + air.cash - integration;
  const text = `${air.name} merged into ${state.airlineName}${paidUsd > 0 ? ` for ${usdM(paidUsd)}` : ""}; integration costs ${usdM(integration)}.`;
  const rivals: RivalsState | null = state.rivals ? {
    ...state.rivals,
    airlines: state.rivals.airlines.map((a) => (a.id === air.id ? { ...a, status: "acquired" as const, fleet: [], routes: [], pending: [], orders: [], cash: 0 } : a)),
    news: [...state.rivals.news, newsItem(state.world.day, air, "acquired", text)].slice(-400),
  } : null;
  return {
    ...state,
    world: {
      ...state.world, cash, routes, fleet: [...state.world.fleet, ...newAircraft], ownedHubs,
      cashLog: [...(state.world.cashLog ?? []), { day: state.world.day, amountUsd: air.cash - paidUsd - integration, text: `${text} Its cash ${usdM(air.cash)} joins yours.` }],
    },
    fleetMeta,
    counters: { ...state.counters, aircraft: nAc, route: nRoute },
    rivals,
  };
}

const newsItem = (day: Day, air: RivalAirline, kind: "acquired", text: string): RivalNewsItem => ({ day, kind, rivalId: air.id, rivalName: air.name, playerMarket: false, text });

/** One competitor buys another (consolidation): fleet, routes and bases move to the buyer. Mutates the cloned rivals state. */
function consolidate(rivals: RivalsState, buyer: RivalAirline, target: RivalAirline, price: number, day: Day): string {
  for (const f of target.fleet) buyer.fleet.push({ ...f, id: `${buyer.id}-ac${++buyer.nextAircraft}` });
  const have = new Map(buyer.routes.map((r) => [r.origin < r.destination ? `${r.origin}|${r.destination}` : `${r.destination}|${r.origin}`, r]));
  for (const r of target.routes) {
    const k = r.origin < r.destination ? `${r.origin}|${r.destination}` : `${r.destination}|${r.origin}`;
    const own = have.get(k);
    if (own) { own.frequency += r.frequency; own.baselineFrequency = own.frequency; continue; }
    buyer.routes.push({ ...r, id: `${buyer.id}:${buyer.nextRoute++}` });
  }
  const newBases = target.bases.filter((b) => !buyer.bases.includes(b));
  buyer.bases = [...buyer.bases, ...newBases];
  buyer.outstations = [...new Set([...(buyer.outstations ?? []), ...newBases])];
  buyer.maxRoutes = (buyer.maxRoutes ?? ARCHETYPES[buyer.archetype].maxRoutes) + target.routes.length;
  buyer.cash += target.cash - price;
  Object.assign(target, { status: "acquired", fleet: [], routes: [], pending: [], orders: [], cash: 0 });
  const text = `${buyer.name} buys ${target.name} for ${usdM(price)}: ${target.name}'s routes and aircraft join ${buyer.name}.`;
  rivals.news.push({ day, kind: "acquired", rivalId: buyer.id, rivalName: buyer.name, playerMarket: false, text });
  return text;
}

/** One-off integration cost of merging `air` into the player (MARKET_PARAMS.integrationShareOfRevenue of its annual revenue). */
export function integrationCostUsd(air: RivalAirline): number {
  return Math.round(MARKET_PARAMS.integrationShareOfRevenue * 52 * air.routes.reduce((s, r) => s + (r.revenue ?? 0), 0));
}

/** What accepting an offer would bring: the bidder's aircraft, routes, bases and cash, less the price paid out. */
export function mergePreview(state: SimState, bidId: Id): { aircraft: number; routes: number; bases: Id[]; cashAfterUsd: number; bidderCashUsd: number; integrationUsd: number } | null {
  const bid = marketOf(state).incoming.find((b) => b.id === bidId);
  const air = bid ? state.rivals?.airlines.find((a) => a.id === bid.rivalId) : undefined;
  if (!bid || !air) return null;
  const integrationUsd = integrationCostUsd(air);
  return { aircraft: air.fleet.length, routes: air.routes.length, bases: air.bases, bidderCashUsd: air.cash, integrationUsd, cashAfterUsd: state.world.cash + air.cash - bid.priceUsd - integrationUsd };
}

/** Month-start bookkeeping: valuation history, competitors' offers for the player, consolidation. Daily: offers lapse. */
export function stepMarket(state: SimState): SimState {
  if (!state.rivals || state.credit?.bankrupt) return state;
  const day = state.world.day;
  let m = marketOf(state);
  const notices: SimEvent[] = [];
  // Offers lapse.
  const lapsed = m.incoming.filter((b) => b.expiresDay <= day);
  if (lapsed.length > 0) {
    m = { ...m, incoming: m.incoming.filter((b) => b.expiresDay > day) };
    for (const b of lapsed) notices.push(say(state, `${possessive(b.rivalName)} offer of ${usdM(b.priceUsd)} for your airline has lapsed.`));
  }
  if (dayToDate(day).dayOfMonth !== 1) {
    return lapsed.length > 0 ? pushNotices({ ...state, market: m }, notices) : state;
  }
  const types = typeMap(state);
  const rng = makeRng(mixSeed(state.world.seed, 0x4d4b54 + day));
  const mine = playerValuation(state);
  const active = state.rivals.airlines.filter((a) => a.status === "active");
  const values = active.map((a) => ({ a, v: rivalValuation(a, types, state.rivals?.originDay ?? 0).valueUsd })).sort((x, y) => y.v - x.v || (x.a.id < y.a.id ? -1 : 1));
  const point: ValuationPoint = { day, valueUsd: mine.valueUsd, rivals: values.map((x) => [x.a.id, Math.round(x.v / 1e5) * 1e5]) };
  m = { ...m, history: [...m.history, point].slice(-MARKET_PARAMS.historyMax) };

  // A competitor's offer for the player: only much larger airlines, more likely when the player is weak (distress or a value well below its peak).
  const lastOffer = m.lastOfferDay ?? -Infinity;
  if (m.incoming.length === 0 && day - (state.rivals.originDay ?? 0) >= 365 && day - lastOffer >= MARKET_PARAMS.offerCooldownDays) {
    const peak = Math.max(...m.history.map((h) => h.valueUsd));
    const weak = !!state.credit?.distressSinceDay || mine.valueUsd < 0.6 * peak;
    const chance = weak ? MARKET_PARAMS.offerChanceWeak : MARKET_PARAMS.offerChancePerMonth;
    const suitors = values.filter((x) => x.v >= MARKET_PARAMS.offerMinValueRatio * mine.valueUsd && x.v <= MARKET_PARAMS.offerMaxValueRatio * mine.valueUsd && x.a.cash > 0 && (m.hostileUntil[x.a.id] ?? -Infinity) < day);
    if (suitors.length > 0 && rng() < chance) {
      const s = suitors[Math.floor(rng() * Math.min(5, suitors.length))]!;
      const [lo, hi] = MARKET_PARAMS.offerPremium;
      const price = roundSig(mine.valueUsd * (lo + (hi - lo) * rng()));
      const bid: IncomingBid = { id: `bid-${m.nextBid}`, rivalId: s.a.id, rivalName: s.a.name, day, expiresDay: day + MARKET_PARAMS.offerExpiryDays, priceUsd: price, valueUsd: mine.valueUsd };
      m = { ...m, incoming: [...m.incoming, bid], nextBid: m.nextBid + 1, lastOfferDay: day };
      notices.push(say(state, `Takeover offer: ${s.a.name} offers ${usdM(price)} for ${state.airlineName} (your value is about ${usdM(mine.valueUsd)}). Accept to run the combined airline, or decline. Open Markets to decide within ${MARKET_PARAMS.offerExpiryDays} days.`));
    }
  }

  // Consolidation among competitors, quarterly.
  let rivals = state.rivals;
  // World field only: the classic field (old saves, calibration tests) keeps its own bankruptcy-only exits.
  if (state.rivals.field === "world" && dayToDate(day).month % 3 === 0) {
    const r2: RivalsState = structuredClone(state.rivals);
    const byId = new Map(r2.airlines.map((a) => [a.id, a]));
    let changed = false;
    for (const t of values.filter((x) => isDistressed(x.a))) {
      const target = byId.get(t.a.id)!;
      if (target.status !== "active" || rng() >= MARKET_PARAMS.consolidationChance) continue;
      const home = state.airports.find((a) => a.id === target.bases[0]);
      const price = t.v * MARKET_PARAMS.distressedPremium;
      const buyer = values.map((x) => byId.get(x.a.id)!).find((b) => {
        if (b.id === target.id || b.status !== "active" || isDistressed(b) || b.cash < price) return false;
        if (rivalValuation(b, types, state.rivals?.originDay ?? 0).valueUsd < 2 * t.v) return false;
        const bh = state.airports.find((a) => a.id === b.bases[0]);
        return !!home && !!bh && distanceKm(home, bh) <= MARKET_PARAMS.consolidationMaxKm;
      });
      if (!buyer) continue;
      notices.push(say(state, consolidate(r2, buyer, target, price, day)));
      changed = true;
    }
    if (changed) rivals = r2;
  }
  return pushNotices({ ...state, market: m, rivals }, notices);
}

/** The value history of one competitor from the monthly top-ten samples (months it was outside the top ten are missing). */
export function rivalHistory(m: MarketState, id: Id): { day: Day; valueUsd: number }[] {
  return m.history.flatMap((h) => { const e = h.rivals.find(([rid]) => rid === id); return e ? [{ day: h.day, valueUsd: e[1] }] : []; });
}
