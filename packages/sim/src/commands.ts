import type { Aircraft, AircraftType, Airport, Command, Day, FarePolicy, Fares, Id, Route, RouteCategory, SimEvent } from "@arg/contracts";
import { canFlyOverwater, isOverwaterRoute } from "@arg/data";
import { distanceKm, simRunwayM } from "./geo";
import { airportOpen, closureOf, dayLabel } from "./world/closures";
import { isRangeFeasible } from "./finance/ledger";
import { TARGET_LOAD_FACTOR_RANGE } from "./route/routeModel";
import { FARE_POLICY_LIMITS } from "./route/farePolicy";
import { baseSlotFeeUsd, playerSlotsAt, rivalSlotsAt, backgroundSlots, routeSlots, terminalsOf, weeklySlotsTotal } from "./route/congestion";
import { defaultLayout, validateLayout } from "./fleet/layout";
import { initialMeta } from "./fleet/maintenance";
import { typeCanServe } from "./fleet/scheduler";
import { routeHourSummary } from "./fleet/hubs";
import { makeRng, mixSeed } from "./rng";
import type { AircraftOrder, SimState } from "./state";
import { dayToDate, START_YEAR, isLeapYear } from "./time/calendar";
import { applyOfferCommand, type OfferCommand, type OfferResult } from "./offers";
import { applyRefit, type CabinCommand, type RefitResult } from "./cabin/refit";
import { applyPlannerCommand, type PlannerOk } from "./planner/commands";
import type { PlannerCommand } from "./planner/types";

// ---------------------------------------------------------------------------
// Parameters (documented in MODEL.md section 6)
// ---------------------------------------------------------------------------
export const COMMAND_PARAMS = {
  maxWeeklyFrequency: 140,
  maxOrderCount: 200,
  /** Delivery lead time from order, months. Narrowbodies 6-18, widebodies 12-30. */
  deliveryMonths: { narrow: [6, 18], wide: [12, 30] } as Record<"narrow" | "wide", readonly [number, number]>,
  /** Months between successive aircraft of one order. */
  deliveryGapMonths: { narrow: 0.5, wide: 1 } as Record<"narrow" | "wide", number>,
  /** Discount off list: base + perLn x ln(count), capped. 1 aircraft 8%, 10 about 22%, 100 about 36%, max 40%. */
  discount: { base: 0.08, perLn: 0.06, max: 0.4 },
  /** Pre-delivery deposit, fraction of net price, paid at order and credited back at delivery. */
  depositFraction: 0.15,
  /** Orders accepted for types up to this many years before their introYear. */
  orderLeadYears: 3,
  daysPerMonth: 30.4375,
} as const;

export function orderDiscount(count: number): number {
  const d = COMMAND_PARAMS.discount;
  return Math.min(d.max, d.base + d.perLn * Math.log(Math.max(1, count)));
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
export type CommandErrorCode =
  | "invalid_speed"
  | "unknown_airport"
  | "same_airport"
  | "unknown_type"
  | "invalid_frequency"
  | "invalid_fare"
  | "invalid_target_load_factor"
  | "out_of_range"
  | "runway_too_short"
  | "overwater_limit"
  | "airport_closed"
  | "no_suitable_aircraft"
  | "duplicate_route"
  | "unknown_route"
  | "invalid_count"
  | "invalid_layout"
  | "type_unavailable"
  | "insufficient_cash"
  | "unknown_offer"
  | "offer_expired"
  | "unknown_aircraft"
  | "aircraft_unavailable"
  | "no_change"
  | "insufficient_block_hours"
  | "insufficient_slots"
  | "invalid_fare_policy"
  | "unknown_policy"
  | "unknown_terminal";

export interface CommandError {
  ok: false;
  error: CommandErrorCode;
  message: string;
}

export interface CommandResultMap {
  setSpeed: { ok: true; kind: "setSpeed"; speed: SimState["speed"] };
  openRoute: { ok: true; kind: "openRoute"; routeId: Id; route: Route; warnings: string[] };
  updateRoute: { ok: true; kind: "updateRoute"; routeId: Id; route: Route; warnings: string[] };
  closeRoute: { ok: true; kind: "closeRoute"; routeId: Id };
  setFarePolicy: { ok: true; kind: "setFarePolicy"; policy: FarePolicy; replaced: boolean };
  removeFarePolicy: { ok: true; kind: "removeFarePolicy"; id: Id };
  setHubTerminal: { ok: true; kind: "setHubTerminal"; airportId: Id; terminalId: Id };
  setAircraftHub: { ok: true; kind: "setAircraftHub"; aircraftId: Id; hubId: Id };
  orderAircraft: {
    ok: true;
    kind: "orderAircraft";
    orderId: Id;
    aircraftIds: Id[];
    deliveryDays: Day[];
    discount: number;
    unitPriceUsd: number;
    depositUsd: number;
  };
}

/** Assign an active aircraft to a base hub (fleet/hubs.ts). Routes it flies must start at that hub. */
export type HubCommand = { kind: "setAircraftHub"; aircraftId: Id; hubId: Id };

export type AnyCommand = Command | OfferCommand | CabinCommand | PlannerCommand | HubCommand;
type OfferOk = Exclude<OfferResult, CommandError>;
type FullResultMap = CommandResultMap & { acceptOffer: Extract<OfferOk, { kind: "acceptOffer" }>; dismissOffer: Extract<OfferOk, { kind: "dismissOffer" }>; refitAircraft: Extract<RefitResult, { ok: true }> }
  & { [K in PlannerCommand["kind"]]: Extract<PlannerOk, { kind: K }> };
export type CommandResult<K extends AnyCommand["kind"] = AnyCommand["kind"]> = FullResultMap[K] | CommandError;
export type ResultOf<C extends AnyCommand> = CommandResult<C["kind"]>;

const fail = (error: CommandErrorCode, message: string): CommandError => ({ ok: false, error, message });

// ---------------------------------------------------------------------------
// Event queue
// ---------------------------------------------------------------------------
/** Append events to the pending queue (pure: returns a new state), dropping the oldest beyond the cap. */
export function pushEvents(state: SimState, events: SimEvent[]): SimState {
  if (events.length === 0) return state;
  const all = [...state.pendingEvents, ...events];
  const limit = state.params.eventQueueLimit;
  return { ...state, pendingEvents: all.length > limit ? all.slice(all.length - limit) : all };
}

/** Take every queued event; returns the events (oldest first) and a state with an empty queue. */
export function drainEvents(state: SimState): { state: SimState; events: SimEvent[] } {
  return { state: { ...state, pendingEvents: [] }, events: state.pendingEvents };
}

export const notice = (state: SimState, text: string): SimEvent => ({ kind: "notice", day: state.world.day, text });

// ---------------------------------------------------------------------------
// Route validation
// ---------------------------------------------------------------------------
interface RouteSpec {
  origin: Id;
  destination: Id;
  weeklyFrequency: number;
  fares: Fares;
  typeId: Id;
}

interface Validated {
  a: Airport;
  b: Airport;
  type: AircraftType;
  dist: number;
  warnings: string[];
}

/**
 * Why `type` may not fly a-b on `day`, or null when it may: closed or not-yet-open airports, range, runway on this sector, and the
 * twin-engine overwater limit. The single source of these rules for the open-route command and for UI previews.
 */
export function routeFeasibilityError(a: Airport, b: Airport, type: AircraftType, day: Day): { code: "airport_closed" | "out_of_range" | "runway_too_short" | "overwater_limit"; message: string } | null {
  for (const ap of [a, b]) {
    if (!airportOpen(ap.id, day)) {
      const c = closureOf(ap.id);
      return { code: "airport_closed", message: c ? `${ap.id} (${ap.name}) closed on ${dayLabel(c.day)}${c.replacedBy ? `; its traffic moved to ${c.replacedBy}` : ""}.` : `${ap.id} (${ap.name}) is not open yet.` };
    }
  }
  const dist = distanceKm(a, b);
  if (!isRangeFeasible(dist, type)) {
    return { code: "out_of_range", message: `${a.id}-${b.id} is ${Math.round(dist)} km; the ${type.name} (range ${type.rangeKm} km) cannot fly it with reserves.` };
  }
  const need = simRunwayM(type, dist);
  const short = a.runwayM < need ? a : b.runwayM < need ? b : null;
  if (short) {
    return { code: "runway_too_short", message: `${short.id} runway is ${short.runwayM} m; the ${type.name} needs ${Math.round(need)} m on this sector.` };
  }
  if (isOverwaterRoute(a, b) && !canFlyOverwater(type, a, b, dist)) {
    return { code: "overwater_limit", message: `${a.id}-${b.id} (${Math.round(dist)} km) counts as an overwater route (water or no diversion airports on the way, e.g. the Atlantic, Alaska to the lower 48); the ${type.name} may not be scheduled on it (twin-engine diversion limit).` };
  }
  return null;
}

function validateRoute(state: SimState, spec: RouteSpec, selfId: Id | null, checkFleet: boolean): Validated | CommandError {
  const a = state.airports.find((x) => x.id === spec.origin);
  const b = state.airports.find((x) => x.id === spec.destination);
  if (!a) return fail("unknown_airport", `Unknown origin airport "${spec.origin}".`);
  if (!b) return fail("unknown_airport", `Unknown destination airport "${spec.destination}".`);
  if (a.id === b.id) return fail("same_airport", "Origin and destination must differ.");
  const type = state.aircraftTypes.find((t) => t.id === spec.typeId);
  if (!type) return fail("unknown_type", `Unknown aircraft type "${spec.typeId}".`);
  if (!Number.isInteger(spec.weeklyFrequency) || spec.weeklyFrequency < 1 || spec.weeklyFrequency > COMMAND_PARAMS.maxWeeklyFrequency) {
    return fail("invalid_frequency", `Weekly frequency must be a whole number from 1 to ${COMMAND_PARAMS.maxWeeklyFrequency}.`);
  }
  const f = spec.fares;
  const bad = (["F", "J", "W", "Y"] as const).find((c) => f[c] !== undefined && !(Number.isFinite(f[c]) && f[c]! > 0));
  if (!f || !Number.isFinite(f.Y) || f.Y <= 0 || bad) {
    return fail("invalid_fare", "Fares must be positive numbers and the economy (Y) fare is required.");
  }
  const dup = state.world.routes.find(
    (r) =>
      r.id !== selfId &&
      ((r.origin === a.id && r.destination === b.id) || (r.origin === b.id && r.destination === a.id)),
  );
  if (dup) return fail("duplicate_route", `${a.id}-${b.id} is already served by route ${dup.id}; update that route instead.`);

  const blocked = routeFeasibilityError(a, b, type, state.world.day);
  if (blocked) return fail(blocked.code, blocked.message);
  const dist = distanceKm(a, b);
  // Slots a week at both ends (not checked while the notional fleet can fly unowned types; same rule as block hours).
  if (!state.params.notionalFleet) {
    const need = routeSlots(spec);
    for (const ap of [a, b]) {
      const total = weeklySlotsTotal(ap);
      const others = playerSlotsAt(state, ap.id, selfId ?? undefined) + rivalSlotsAt(state, ap.id) + backgroundSlots(state.world.seed, ap);
      const available = Math.max(0, total - others);
      if (need > available) {
        return fail("insufficient_slots", `${a.id}-${b.id} at ${spec.weeklyFrequency}/wk needs ${need} slots a week at ${ap.id}; ${available} are available (${total} total, ${others} used by others and your other routes).`);
      }
    }
  }

  // Block-hour pool of the origin hub for this type (not checked while the notional fleet can fly unowned types).
  if (!state.params.notionalFleet) {
    const h = routeHourSummary(state, a.id, b.id, type.id, spec.weeklyFrequency, selfId ?? undefined);
    if (h.needed > h.free + 1e-9) {
      return fail(
        "insufficient_block_hours",
        `${a.id}-${b.id} at ${spec.weeklyFrequency}/wk on the ${type.name} needs ${h.needed.toFixed(1)} block hours a week from ${a.id}; ${Math.max(0, h.free).toFixed(1)} are free there (${h.available.toFixed(1)} available, ${h.used.toFixed(1)} used).`,
      );
    }
  }

  const warnings: string[] = [];
  if (checkFleet) {
    const owned = state.world.fleet.filter((ac) => ac.status !== "stored");
    const sameType = owned.filter((ac) => ac.typeId === type.id);
    if (sameType.length > 0) {
      if (sameType.every((ac) => ac.status === "delivery")) warnings.push(`All ${type.id} aircraft are still on order; the route cannot fly until the first is delivered.`);
    } else {
      const subs = owned.filter((ac) => {
        const t = state.aircraftTypes.find((x) => x.id === ac.typeId);
        return t !== undefined && t.widebody === type.widebody && typeCanServe(a, b, t);
      });
      if (subs.length === 0) {
        return fail("no_suitable_aircraft", `No aircraft in the fleet can fly ${a.id}-${b.id}. Order or acquire a ${type.name} or similar first.`);
      }
      warnings.push(`No ${type.id} in the fleet; the scheduler will substitute ${subs[0]!.typeId} or similar.`);
    }
  }
  return { a, b, type, dist, warnings };
}

function nextId(state: SimState, kind: keyof SimState["counters"]): { id: number; counters: SimState["counters"] } {
  const id = state.counters[kind] + 1;
  return { id, counters: { ...state.counters, [kind]: id } };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
function yearStartDay(year: number): Day {
  let d = 0;
  for (let y = START_YEAR; y < year; y++) d += isLeapYear(y) ? 366 : 365;
  return d;
}

function doOrder(state: SimState, cmd: Extract<Command, { kind: "orderAircraft" }>): { state: SimState; result: CommandResult<"orderAircraft"> } {
  const type = state.aircraftTypes.find((t) => t.id === cmd.typeId);
  if (!type) return { state, result: fail("unknown_type", `Unknown aircraft type "${cmd.typeId}".`) };
  if (!Number.isInteger(cmd.count) || cmd.count < 1 || cmd.count > COMMAND_PARAMS.maxOrderCount) {
    return { state, result: fail("invalid_count", `Order size must be a whole number from 1 to ${COMMAND_PARAMS.maxOrderCount}.`) };
  }
  const year = dayToDate(state.world.day).year;
  if ((type.endYear !== null && type.endYear < year) || type.introYear > year + COMMAND_PARAMS.orderLeadYears) {
    return {
      state,
      result: fail(
        "type_unavailable",
        type.endYear !== null && type.endYear < year
          ? `The ${type.name} went out of production in ${type.endYear}.`
          : `The ${type.name} is not offered until ${type.introYear}.`,
      ),
    };
  }
  const layout = cmd.layout && cmd.layout.sections?.length ? cmd.layout : defaultLayout(type);
  const bad = validateLayout(type, layout);
  if (bad) return { state, result: fail("invalid_layout", bad.message) };

  const discount = orderDiscount(cmd.count);
  const unitPriceUsd = type.listPriceUsdM * 1e6 * (1 - discount);
  const depositUsd = unitPriceUsd * cmd.count * COMMAND_PARAMS.depositFraction;
  if (state.world.cash < depositUsd) {
    return {
      state,
      result: fail("insufficient_cash", `The deposit is $${(depositUsd / 1e6).toFixed(1)}M but cash is $${(state.world.cash / 1e6).toFixed(1)}M.`),
    };
  }

  const { id: orderNum, counters: c1 } = nextId(state, "order");
  const orderId = `order-${orderNum}`;
  const rng = makeRng(mixSeed(state.world.seed, orderNum * 7919 + state.world.day));
  const kind = type.widebody ? "wide" : "narrow";
  const [lo, hi] = COMMAND_PARAMS.deliveryMonths[kind];
  const gap = COMMAND_PARAMS.deliveryGapMonths[kind];
  const first = lo + rng() * Math.max(0, hi - lo - Math.min(hi - lo, (cmd.count - 1) * gap)) ;
  const introDay = yearStartDay(type.introYear);
  const aircraft: Aircraft[] = [];
  const meta = { ...state.fleetMeta };
  const deliveryDays: Day[] = [];
  let counters = c1;
  for (let i = 0; i < cmd.count; i++) {
    const months = Math.min(hi, first + i * gap);
    const day = Math.max(introDay + Math.floor(i * gap * COMMAND_PARAMS.daysPerMonth), state.world.day + Math.round(months * COMMAND_PARAMS.daysPerMonth));
    const n = nextId({ ...state, counters }, "aircraft");
    counters = n.counters;
    const ac: Aircraft = {
      id: `ac-${n.id}`,
      typeId: type.id,
      tailNumber: `N${String(n.id).padStart(3, "0")}SP`,
      layout,
      status: "delivery",
      ageDays: 0,
      hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 },
    };
    const m = initialMeta(ac, rng);
    m.deliveryDay = day;
    m.orderId = orderId;
    meta[ac.id] = m;
    aircraft.push(ac);
    deliveryDays.push(day);
  }
  const order: AircraftOrder = {
    id: orderId, typeId: type.id, count: cmd.count, layout, orderDay: state.world.day, discount, unitPriceUsd, depositUsd,
    aircraftIds: aircraft.map((a) => a.id), deliveryDays,
    // Recurring ownership cost follows the net price paid, as for offer orders.
    ownershipFactor: unitPriceUsd / (type.listPriceUsdM * 1e6),
  };
  const firstDate = dayToDate(Math.min(...deliveryDays));
  const text = `Ordered ${cmd.count} x ${type.id} at ${(discount * 100).toFixed(0)}% off list ($${(unitPriceUsd / 1e6).toFixed(1)}M each). Deposit $${(depositUsd / 1e6).toFixed(1)}M paid; first delivery ${firstDate.year}-${String(firstDate.month + 1).padStart(2, "0")}.`;
  const next: SimState = pushEvents(
    {
      ...state,
      world: { ...state.world, cash: state.world.cash - depositUsd, fleet: [...state.world.fleet, ...aircraft] },
      fleetMeta: meta,
      orders: [...state.orders, order],
      counters,
    },
    [notice(state, text)],
  );
  return {
    state: next,
    result: { ok: true, kind: "orderAircraft", orderId, aircraftIds: order.aircraftIds, deliveryDays, discount, unitPriceUsd, depositUsd },
  };
}

// ---------------------------------------------------------------------------
// Fare policies
// ---------------------------------------------------------------------------
const ROUTE_CATEGORIES: readonly RouteCategory[] = ["short", "medium", "long", "ultra-long", "hub-spoke", "point-to-point", "domestic", "international"];

function doSetFarePolicy(state: SimState, p: FarePolicy): { state: SimState; result: CommandResult<"setFarePolicy"> } {
  const bad = (m: string) => ({ state, result: fail("invalid_fare_policy", m) as CommandError });
  if (!p || typeof p.id !== "string" || p.id.trim() === "") return bad("A fare policy needs an id.");
  if (typeof p.name !== "string" || p.name.trim() === "") return bad("A fare policy needs a name.");
  const { min, max } = FARE_POLICY_LIMITS.targetLoadFactor;
  if (p.targetLoadFactor !== null && !(Number.isFinite(p.targetLoadFactor) && p.targetLoadFactor >= min && p.targetLoadFactor <= max)) {
    return bad(`Target load factor must be between ${Math.round(min * 100)}% and ${Math.round(max * 100)}%, or blank for none.`);
  }
  const md = FARE_POLICY_LIMITS.connectionMarkdown;
  if (!(Number.isFinite(p.connectionMarkdown) && p.connectionMarkdown >= md.min && p.connectionMarkdown <= md.max)) {
    return bad(`Connection markdown must be between ${md.min} and ${md.max}.`);
  }
  if (p.scope !== "all") {
    if (!p.scope || typeof p.scope !== "object") return bad('Scope must be "all" or { categories?, routeIds? }.');
    const cats = p.scope.categories ?? [];
    const badCat = cats.find((c) => !ROUTE_CATEGORIES.includes(c));
    if (!Array.isArray(cats) || badCat !== undefined) return bad(`Unknown route category "${String(badCat)}".`);
    const ids = p.scope.routeIds ?? [];
    if (!Array.isArray(ids)) return bad("routeIds must be a list.");
    const missing = ids.find((id) => !state.world.routes.some((r) => r.id === id));
    if (missing !== undefined) return bad(`Unknown route "${missing}" in the policy scope.`);
  }
  const list = state.world.farePolicies ?? [];
  const replaced = list.some((x) => x.id === p.id);
  const policy: FarePolicy = { ...p, scope: p.scope === "all" ? "all" : { ...p.scope } };
  const farePolicies = replaced ? list.map((x) => (x.id === p.id ? policy : x)) : [...list, policy];
  return {
    state: pushEvents({ ...state, world: { ...state.world, farePolicies } }, [notice(state, `${replaced ? "Updated" : "Added"} fare policy "${p.name}".`)]),
    result: { ok: true, kind: "setFarePolicy", policy, replaced },
  };
}

// ---------------------------------------------------------------------------
// applyCommand
// ---------------------------------------------------------------------------
/** Apply a UI command. Pure: returns the new state and a typed result; the input state is not modified. */
export function applyCommand<C extends AnyCommand>(state: SimState, cmd: C): { state: SimState; result: ResultOf<C> } {
  const out = apply(state, cmd);
  return out as { state: SimState; result: ResultOf<C> };
}

function apply(state: SimState, cmd: AnyCommand): { state: SimState; result: CommandResult } {
  switch (cmd.kind) {
    case "acceptOffer":
    case "dismissOffer":
      return applyOfferCommand(state, cmd);
    case "refitAircraft":
      return applyRefit(state, cmd);
    case "pinAircraft":
    case "setRouteTypes":
    case "reserveAircraft":
    case "applyCover":
    case "ignoreGap":
      return applyPlannerCommand(state, cmd);
    case "setSpeed": {
      if (![0, 1, 2, 3, 4, 5].includes(cmd.speed)) return { state, result: fail("invalid_speed", "Speed must be 0 to 5.") };
      return { state: { ...state, speed: cmd.speed }, result: { ok: true, kind: "setSpeed", speed: cmd.speed } };
    }
    case "openRoute": {
      const v = validateRoute(state, cmd.route, null, true);
      if ("ok" in v) return { state, result: v };
      const { id, counters } = nextId(state, "route");
      const route: Route = { ...cmd.route, id: `route-${id}`, fares: { ...cmd.route.fares } };
      const next = pushEvents(
        { ...state, world: { ...state.world, routes: [...state.world.routes, route] }, counters },
        [notice(state, `Opened ${v.a.id}-${v.b.id}: ${route.weeklyFrequency}/wk with ${route.typeId} (${Math.round(v.dist)} km).`)],
      );
      return { state: next, result: { ok: true, kind: "openRoute", routeId: route.id, route, warnings: v.warnings } };
    }
    case "updateRoute": {
      const cur = state.world.routes.find((r) => r.id === cmd.id);
      if (!cur) return { state, result: fail("unknown_route", `No route with id "${cmd.id}".`) };
      const { id: _ignored, targetLoadFactor: target, ...patch } = cmd.patch as typeof cmd.patch & { id?: Id };
      const { min, max } = TARGET_LOAD_FACTOR_RANGE;
      if (target !== undefined && target !== null && !(Number.isFinite(target) && target >= min && target <= max)) {
        return { state, result: fail("invalid_target_load_factor", `Target load factor must be between ${Math.round(min * 100)}% and ${Math.round(max * 100)}%.`) };
      }
      const merged: Route = { ...cur, ...(patch as Partial<Route>), id: cur.id };
      if (target === null) delete merged.targetLoadFactor;
      else if (target !== undefined) merged.targetLoadFactor = target;
      const pairOrTypeChanged = merged.origin !== cur.origin || merged.destination !== cur.destination || merged.typeId !== cur.typeId;
      const v = validateRoute(state, merged, cur.id, pairOrTypeChanged);
      if ("ok" in v) return { state, result: v };
      const next = pushEvents(
        { ...state, world: { ...state.world, routes: state.world.routes.map((r) => (r.id === cur.id ? merged : r)) } },
        [notice(state, `Updated ${v.a.id}-${v.b.id}: ${merged.weeklyFrequency}/wk, Y $${Math.round(merged.fares.Y)}, ${merged.typeId}.`)],
      );
      return { state: next, result: { ok: true, kind: "updateRoute", routeId: cur.id, route: merged, warnings: v.warnings } };
    }
    case "closeRoute": {
      const cur = state.world.routes.find((r) => r.id === cmd.id);
      if (!cur) return { state, result: fail("unknown_route", `No route with id "${cmd.id}".`) };
      const { [cur.id]: _gone, ...reports } = state.routeReports;
      const next = pushEvents(
        { ...state, world: { ...state.world, routes: state.world.routes.filter((r) => r.id !== cur.id) }, routeReports: reports },
        [notice(state, `Closed ${cur.origin}-${cur.destination}.`)],
      );
      return { state: next, result: { ok: true, kind: "closeRoute", routeId: cur.id } };
    }
    case "orderAircraft":
      return doOrder(state, cmd);
    case "setFarePolicy":
      return doSetFarePolicy(state, cmd.policy);
    case "removeFarePolicy": {
      const list = state.world.farePolicies ?? [];
      const cur = list.find((p) => p.id === cmd.id);
      if (!cur) return { state, result: fail("unknown_policy", `No fare policy with id "${cmd.id}".`) };
      return {
        state: pushEvents({ ...state, world: { ...state.world, farePolicies: list.filter((p) => p.id !== cmd.id) } }, [notice(state, `Removed fare policy "${cur.name}".`)]),
        result: { ok: true, kind: "removeFarePolicy", id: cmd.id },
      };
    }
    case "setHubTerminal": {
      const ap = state.airports.find((x) => x.id === cmd.airportId);
      if (!ap) return { state, result: fail("unknown_airport", `Unknown airport "${cmd.airportId}".`) };
      const t = terminalsOf(ap).find((x) => x.id === cmd.terminalId);
      if (!t) return { state, result: fail("unknown_terminal", `${ap.id} has no terminal "${cmd.terminalId}" (${terminalsOf(ap).map((x) => x.id).join(", ")}).`) };
      if ((state.world.hubTerminals ?? {})[ap.id] === t.id) return { state, result: fail("no_change", `${ap.id} already uses ${t.name}.`) };
      return {
        state: pushEvents({ ...state, world: { ...state.world, hubTerminals: { ...state.world.hubTerminals, [ap.id]: t.id } } }, [notice(state, `${ap.id}: now operating from ${t.name} (fee x${t.feeMultiplier}, $${Math.round(baseSlotFeeUsd(ap) * t.feeMultiplier)} a slot).`)]),
        result: { ok: true, kind: "setHubTerminal", airportId: ap.id, terminalId: t.id },
      };
    }
    case "setAircraftHub": {
      const ac = state.world.fleet.find((x) => x.id === cmd.aircraftId);
      if (!ac) return { state, result: fail("unknown_aircraft", `No aircraft "${cmd.aircraftId}".`) };
      if (ac.status !== "active") return { state, result: fail("aircraft_unavailable", `${ac.tailNumber} is ${ac.status}; only active aircraft can be based at a hub.`) };
      if (!state.airports.some((x) => x.id === cmd.hubId)) return { state, result: fail("unknown_airport", `Unknown hub airport "${cmd.hubId}".`) };
      const fleet = state.world.fleet.map((x) => (x.id === ac.id ? { ...x, hubId: cmd.hubId } : x));
      return {
        state: pushEvents({ ...state, world: { ...state.world, fleet } }, [notice(state, `${ac.tailNumber} now based at ${cmd.hubId}.`)]),
        result: { ok: true, kind: "setAircraftHub", aircraftId: ac.id, hubId: cmd.hubId },
      };
    }
  }
}
