import { usdM } from "../money";
import type { Aircraft, Day, SimEvent } from "@arg/contracts";
import { COMMAND_PARAMS, notice, pushEvents, type CommandError } from "../commands";
import { defaultLayout } from "../fleet/layout";
import { initialMeta } from "../fleet/maintenance";
import { makeRng, mixSeed } from "../rng";
import type { AircraftMeta, AircraftOrder, SimState } from "../state";
import { generateOffer, KIND_LABEL, monthYear, OFFER_PARAMS } from "./generate";
import type { Offer, OfferCommand } from "./types";

export type OfferErrorCode = "unknown_offer" | "offer_expired" | "invalid_count" | "insufficient_cash";

export type OfferResult =
  | { ok: true; kind: "dismissOffer"; offerId: string }
  | {
      ok: true; kind: "acceptOffer"; offerId: string; orderId: string; aircraftIds: string[]; deliveryDays: Day[];
      discount: number; unitPriceUsd: number; depositUsd: number;
    }
  | CommandError;

const fail = (error: CommandError["error"], message: string): CommandError => ({ ok: false, error, message });
const M = (usd: number) => usdM(usd);

/** Lowest-day-first stable hash of a string, for per-order random streams. */
function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function describe(o: Offer, name: string): string {
  return `${KIND_LABEL[o.kind]} offer ${o.id}: ${o.quantity} x ${name} at ${M(o.unitPriceUsd)} each, ${Math.round(o.discount * 100)}% below list.`;
}

/**
 * Daily offer processing, called once at the end of `stepDay` (after the day counter advanced):
 * expire and warn, announce delivery slips on launch orders, then possibly generate one new offer. Pure.
 */
export function stepOffers(state: SimState): SimState {
  const day = state.world.day;
  const events: SimEvent[] = [];
  const say = (text: string) => events.push({ kind: "notice", day, text });
  const typeName = (id: string) => state.aircraftTypes.find((t) => t.id === id)?.id ?? id;
  let offers = state.offers;
  let offerLog = state.offerLog;

  // Expiry and warnings.
  const kept: Offer[] = [];
  for (const o of offers) {
    if (o.expiresDay <= day) { say(`Offer expired: ${o.quantity} x ${typeName(o.typeId)} (${KIND_LABEL[o.kind]}, ${o.id}).`); continue; }
    if (!o.expiryWarned && o.expiresDay - day <= OFFER_PARAMS.expiryWarnDays) {
      say(`Offer expiring soon: ${o.quantity} x ${typeName(o.typeId)} (${KIND_LABEL[o.kind]}, ${o.id}) closes in ${o.expiresDay - day} days.`);
      kept.push({ ...o, expiryWarned: true });
    } else kept.push(o);
  }
  offers = kept;

  // Delivery slips on launch-customer orders: one seeded roll per order, announced about four months before first delivery.
  let orders = state.orders;
  let fleetMeta = state.fleetMeta;
  const delivered = new Set(state.world.fleet.filter((a) => a.status !== "delivery").map((a) => a.id));
  orders = orders.map((order) => {
    if (order.delayRisk === undefined || order.delayResolved) return order;
    const pending = order.deliveryDays.filter((_, i) => !delivered.has(order.aircraftIds[i]!));
    if (pending.length === 0) return { ...order, delayResolved: true };
    if (Math.min(...pending) - day > 120) return order;
    const rng = makeRng(mixSeed(state.world.seed, hashId(order.id)));
    const slips = rng() < order.delayRisk;
    const months = slips ? 1 + Math.floor(rng() * (order.maxDelayMonths ?? 12)) : 0;
    if (!slips) {
      say(`Launch order ${order.id} (${typeName(order.typeId)}) is on schedule for ${monthYear(Math.min(...pending))}.`);
      return { ...order, delayResolved: true, delayDays: 0 };
    }
    const shift = Math.round(months * COMMAND_PARAMS.daysPerMonth);
    const ids = new Set(order.aircraftIds.filter((id) => !delivered.has(id)));
    if (fleetMeta === state.fleetMeta) fleetMeta = { ...fleetMeta };
    for (const id of ids) {
      const m = fleetMeta[id];
      if (m && m.deliveryDay !== null) fleetMeta[id] = { ...m, deliveryDay: m.deliveryDay + shift };
    }
    const deliveryDays = order.deliveryDays.map((d, i) => (ids.has(order.aircraftIds[i]!) ? d + shift : d));
    say(`Delivery delayed: order ${order.id} (${typeName(order.typeId)}) slips ${months} month${months > 1 ? "s" : ""}; first aircraft now due ${monthYear(Math.min(...deliveryDays.filter((_, i) => ids.has(order.aircraftIds[i]!))))}.`);
    return { ...order, deliveryDays, delayResolved: true, delayDays: shift };
  });

  // New offer.
  const probe: SimState = { ...state, offers, offerLog };
  const fresh = generateOffer(probe, day);
  if (fresh) {
    offers = [...offers, fresh];
    offerLog = { ...offerLog, [`${fresh.kind}:${fresh.typeId}`]: day };
    say(`New offer: ${describe(fresh, typeName(fresh.typeId))} Closes in ${fresh.expiresDay - day} days.`);
  }

  const next: SimState = { ...state, offers, offerLog, orders, fleetMeta };
  return pushEvents(next, events);
}

function accept(state: SimState, offerId: string, quantity: number): { state: SimState; result: OfferResult } {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return { state, result: fail("unknown_offer", `No open offer "${offerId}".`) };
  const day = state.world.day;
  if (offer.expiresDay <= day) return { state, result: fail("offer_expired", "That offer has expired.") };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > offer.quantity) {
    return { state, result: fail("invalid_count", `Choose 1 to ${offer.quantity} aircraft.`) };
  }
  const type = state.aircraftTypes.find((t) => t.id === offer.typeId);
  if (!type) return { state, result: fail("unknown_type", `Unknown aircraft type "${offer.typeId}".`) };
  const depositUsd = offer.unitPriceUsd * quantity * offer.depositFraction;
  if (state.world.cash < depositUsd) {
    return { state, result: fail("insufficient_cash", `The deposit is ${M(depositUsd)} but cash is ${M(state.world.cash)}.`) };
  }

  const orderNum = state.counters.order + 1;
  const orderId = `order-${orderNum}`;
  const rng = makeRng(mixSeed(state.world.seed, orderNum * 7919 + day));
  const layout = offer.layout ?? defaultLayout(type);
  const start = Math.max(offer.firstDeliveryDay, day + 7);
  const aircraft: Aircraft[] = [];
  const meta: Record<string, AircraftMeta> = { ...state.fleetMeta };
  const deliveryDays: Day[] = [];
  let acN = state.counters.aircraft;
  for (let i = 0; i < quantity; i++) {
    acN++;
    const ac: Aircraft = {
      id: `ac-${acN}`, typeId: type.id, tailNumber: `N${String(acN).padStart(3, "0")}SP`, layout,
      status: "delivery", ageDays: 0, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 },
    };
    const m = initialMeta(ac, rng);
    const d = start + Math.floor(i * offer.deliveryGapDays);
    m.deliveryDay = d;
    m.orderId = orderId;
    if (offer.flightHours !== null) { m.flightHours = offer.flightHours; m.cycles = Math.round(offer.flightHours / 2.2); }
    meta[ac.id] = m;
    aircraft.push(ac);
    deliveryDays.push(d);
  }
  const order: AircraftOrder = {
    id: orderId, typeId: type.id, count: quantity, layout, orderDay: day, discount: offer.discount,
    unitPriceUsd: offer.unitPriceUsd, depositUsd, aircraftIds: aircraft.map((a) => a.id), deliveryDays,
    offerId: offer.id,
    ownershipFactor: offer.unitPriceUsd / offer.listPriceUsd,
    ...(offer.ageYears !== null ? { ageDays: Math.round(offer.ageYears * 365.25) } : {}),
    ...(offer.delayRisk > 0 ? { delayRisk: offer.delayRisk, maxDelayMonths: offer.maxDelayMonths, delayResolved: false } : {}),
  };
  const left = offer.quantity - quantity;
  const offers = left > 0 ? state.offers.map((o) => (o.id === offer.id ? { ...o, quantity: left } : o)) : state.offers.filter((o) => o.id !== offer.id);
  const text =
    `Ordered ${quantity} x ${type.id} under ${KIND_LABEL[offer.kind].toLowerCase()} offer ${offer.id} at ${Math.round(offer.discount * 100)}% off list ` +
    `(${M(offer.unitPriceUsd)} each). Deposit ${M(depositUsd)} paid; first delivery ${monthYear(deliveryDays[0]!)}.`;
  const next = pushEvents(
    {
      ...state,
      world: { ...state.world, cash: state.world.cash - depositUsd, fleet: [...state.world.fleet, ...aircraft] },
      fleetMeta: meta,
      orders: [...state.orders, order],
      offers,
      counters: { ...state.counters, order: orderNum, aircraft: acN },
    },
    [notice(state, text)],
  );
  return {
    state: next,
    result: { ok: true, kind: "acceptOffer", offerId, orderId, aircraftIds: order.aircraftIds, deliveryDays, discount: offer.discount, unitPriceUsd: offer.unitPriceUsd, depositUsd },
  };
}

/** Handle acceptOffer / dismissOffer. Pure. */
export function applyOfferCommand(state: SimState, cmd: OfferCommand): { state: SimState; result: OfferResult } {
  if (cmd.kind === "dismissOffer") {
    if (!state.offers.some((o) => o.id === cmd.offerId)) return { state, result: fail("unknown_offer", `No open offer "${cmd.offerId}".`) };
    return { state: { ...state, offers: state.offers.filter((o) => o.id !== cmd.offerId) }, result: { ok: true, kind: "dismissOffer", offerId: cmd.offerId } };
  }
  return accept(state, cmd.offerId, cmd.quantity);
}
