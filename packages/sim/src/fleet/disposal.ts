// Selling owned aircraft and returning leased ones. Pure and deterministic: the quotes here are what the commands pay, and what the
// app shows in its confirm dialog. See MODEL.md "Selling aircraft, lease returns and fleet diversity".
import type { Aircraft, AircraftType, Id } from "@arg/contracts";
import { aircraftBookValueUsd, creditLimitUsd, keptValueFraction } from "../finance/credit";
import { monthlyOwnershipUsd } from "../finance/ledger";
import { usdM } from "../money";
import { plannerPrefs } from "../planner/forecast";
import type { PlannerState } from "../planner/types";
import type { AircraftOrder, SimState } from "../state";
import { assign } from "./scheduler";
import { homeHubOf } from "./hubs";
import { DISPOSAL_PARAMS, FINANCING_PARAMS, isObsolete, obsolescenceMultiplier } from "./lifecycle";

/** Refusal reasons for the two disposal commands (a subset of the sim's CommandErrorCode). */
export type DisposalError =
  | "unknown_aircraft" | "unknown_type" | "aircraft_unavailable" | "aircraft_on_route" | "leased_aircraft" | "not_leased" | "credit_limit" | "insufficient_cash";

export type DisposalAction = "sell" | "return";

export interface DisposalQuote {
  ok: true;
  action: DisposalAction;
  aircraftId: Id;
  tail: string;
  typeId: Id;
  /** Sale: cash received. Return: 0. */
  proceedsUsd: number;
  /** Return: termination fee paid. Sale: 0. */
  feeUsd: number;
  /** Sale: depreciated book value the proceeds start from (the credit line counts this at its advance rate). */
  bookValueUsd: number;
  /** Credit limit before and after the aircraft leaves the fleet. */
  creditLimitBeforeUsd: number;
  creditLimitAfterUsd: number;
  /** Cash after the transaction. */
  cashAfterUsd: number;
  /** Return: the lease payment and aircraft overhead per month that stop. Sale: the overhead per month that stops. */
  monthlySavingUsd: number;
}
export interface DisposalRefusal { ok: false; error: DisposalError; message: string }
export type DisposalResult = DisposalQuote | DisposalRefusal;

const refuse = (error: DisposalError, message: string): DisposalRefusal => ({ ok: false, error, message });
const DAYS_PER_MONTH = 30.4375;

const orderOf = (state: SimState, ac: Pick<Aircraft, "id">): AircraftOrder | undefined => state.orders.find((o) => o.aircraftIds.includes(ac.id));

/** How the airline holds an aircraft. Outright purchases can be sold; everything else (explicit leases, offer orders and the starting fleet, which all pay the lease-equivalent) is returned. */
export function holdingOf(state: SimState, ac: Aircraft): "purchase" | "lease" {
  const financing = ac.financing ?? orderOf(state, ac)?.financing;
  return financing === "purchase" ? "purchase" : "lease";
}

/** Route names (ORIG-DEST) the scheduler would fly this aircraft on today, plus any route it is pinned to. Fresh from the scheduler, not from the last report. */
export function routesFlownBy(state: SimState, aircraftId: Id): string[] {
  const day = state.world.day;
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const prefs = plannerPrefs(state, day);
  const names = new Map(state.world.routes.map((r) => [r.id, `${r.origin}-${r.destination}`]));
  const out = new Set<string>();
  const sched = assign(state.world.routes, state.world.fleet, { airports, types, prefs, homeHub: homeHubOf(state) });
  for (const a of sched.aircraft[aircraftId]?.assignments ?? []) out.add(names.get(a.routeId) ?? a.routeId);
  const pinned = prefs?.pins?.get(aircraftId);
  if (pinned && names.has(pinned)) out.add(names.get(pinned)!);
  return [...out].sort();
}

/**
 * What a dealer pays for the aircraft today: the depreciated book value (list price straight-lined to the residual; the credit
 * line's own figure), capped by the price actually paid for it (rolled forward with the same depreciation), times the market factor,
 * times a haircut for widebodies and for obsolete types.
 */
export function saleValueUsd(state: SimState, ac: Aircraft, type: AircraftType): number {
  const book = aircraftBookValueUsd(type, ac.ageDays);
  const order = orderOf(state, ac);
  const paidBook = order ? order.unitPriceUsd * (keptValueFraction(ac.ageDays) / keptValueFraction(order.ageDays ?? 0)) : book;
  const D = DISPOSAL_PARAMS;
  return Math.min(book, paidBook) * D.marketFactor * (type.widebody ? D.widebodyFactor : 1) * (isObsolete(type, state.world.day) ? D.obsoleteFactor : 1);
}

/** Monthly lease payment of a leased aircraft: lease-equivalent at the price paid, with the obsolescence uplift (what stepDay charges). */
export function leasePaymentMonthlyUsd(state: SimState, ac: Aircraft, type: AircraftType): number {
  const factor = orderOf(state, ac)?.ownershipFactor ?? 1;
  return monthlyOwnershipUsd(type) * factor * obsolescenceMultiplier(type, state.world.day);
}

/** Termination fee for returning a lease early. */
export const leaseReturnFeeUsd = (state: SimState, ac: Aircraft, type: AircraftType): number => DISPOSAL_PARAMS.leaseTerminationMonths * leasePaymentMonthlyUsd(state, ac, type);

/** The state without this aircraft: fleet, per-aircraft bookkeeping, its slot in the order (count and deposit shrink with it) and its planner entries. */
export function withoutAircraft(state: SimState, aircraftId: Id): SimState {
  const fleet = state.world.fleet.filter((a) => a.id !== aircraftId);
  const { [aircraftId]: _meta, ...fleetMeta } = state.fleetMeta;
  void _meta;
  const orders = state.orders.flatMap((o): AircraftOrder[] => {
    const i = o.aircraftIds.indexOf(aircraftId);
    if (i < 0) return [o];
    if (o.count <= 1) return [];
    const per = o.depositUsd / o.count;
    return [{ ...o, count: o.count - 1, depositUsd: per * (o.count - 1), aircraftIds: o.aircraftIds.filter((_, k) => k !== i), deliveryDays: o.deliveryDays.filter((_, k) => k !== i) }];
  });
  let planner: PlannerState | undefined = state.planner;
  if (planner && (planner.pins[aircraftId] || planner.reserved[aircraftId])) {
    const { [aircraftId]: _pin, ...pins } = planner.pins;
    const { [aircraftId]: _res, ...reserved } = planner.reserved;
    void _pin; void _res;
    planner = { ...planner, pins, reserved };
  }
  return { ...state, world: { ...state.world, fleet }, fleetMeta, orders, ...(planner ? { planner } : {}) };
}

/**
 * Check and price selling (`sell`) or returning (`return`) one aircraft. The single source of the rules for the commands and the UI.
 * Refusals: unknown, still on order or in the hangar, flies or is pinned to a route, wrong kind of holding (a leased aircraft cannot be
 * sold, an owned one has no lease to return), and, for a sale, a deal that would leave cash beyond a credit line the sale itself shrank.
 */
export function disposalQuote(state: SimState, aircraftId: Id, action: DisposalAction): DisposalResult {
  const ac = state.world.fleet.find((a) => a.id === aircraftId);
  if (!ac) return refuse("unknown_aircraft", `No aircraft "${aircraftId}".`);
  const type = state.aircraftTypes.find((t) => t.id === ac.typeId);
  if (!type) return refuse("unknown_type", `${ac.tailNumber} has an unknown type "${ac.typeId}".`);
  const verb = action === "sell" ? "sold" : "returned";
  if (ac.status === "delivery") return refuse("aircraft_unavailable", `${ac.tailNumber} is not delivered yet and cannot be ${verb}. Cancel the order instead.`);
  if (ac.status === "maintenance") return refuse("aircraft_unavailable", `${ac.tailNumber} is in the hangar and cannot be ${verb} until it is back in service.`);
  const holding = holdingOf(state, ac);
  if (action === "sell" && holding === "lease") return refuse("leased_aircraft", `${ac.tailNumber} is leased, not owned, so it cannot be sold. Return the lease instead (a termination fee applies).`);
  if (action === "return" && holding === "purchase") return refuse("not_leased", `${ac.tailNumber} is owned outright, so there is no lease to return. Sell it instead.`);
  const routes = routesFlownBy(state, ac.id);
  if (routes.length > 0) {
    return refuse("aircraft_on_route", `${ac.tailNumber} is flying ${routes.join(", ")}. Take it off its routes first (close the route, lower the frequency or unpin it), then ${action === "sell" ? "sell" : "return"} it.`);
  }

  const limitBefore = creditLimitUsd(state);
  const limitAfter = creditLimitUsd(withoutAircraft(state, ac.id));
  const base = { ok: true as const, action, aircraftId: ac.id, tail: ac.tailNumber, typeId: ac.typeId, creditLimitBeforeUsd: limitBefore, creditLimitAfterUsd: limitAfter };
  const overheadMonthly = state.params.overheadPerAircraftPerDay * ((ac.financing ?? orderOf(state, ac)?.financing) === "lease" ? 1 + FINANCING_PARAMS.leaseOperatingUplift : 1) * DAYS_PER_MONTH;
  const cash = state.world.cash;

  if (action === "sell") {
    const proceeds = saleValueUsd(state, ac, type);
    const marginBefore = cash + limitBefore;
    const marginAfter = cash + proceeds + limitAfter;
    if (marginAfter < 0 && marginAfter < marginBefore) {
      return refuse("credit_limit", `Selling ${ac.tailNumber} for ${usdM(proceeds)} would cut your credit line from ${usdM(limitBefore)} to ${usdM(limitAfter)} and leave cash ${usdM(cash + proceeds)} beyond it. It would not help.`);
    }
    return { ...base, proceedsUsd: proceeds, feeUsd: 0, bookValueUsd: aircraftBookValueUsd(type, ac.ageDays), cashAfterUsd: cash + proceeds, monthlySavingUsd: overheadMonthly };
  }
  const fee = leaseReturnFeeUsd(state, ac, type);
  if (cash - fee < -limitBefore) {
    return refuse("insufficient_cash", `Returning ${ac.tailNumber} early costs ${usdM(fee)} (${DISPOSAL_PARAMS.leaseTerminationMonths} months of lease), but cash is ${usdM(cash)} against a credit line of ${usdM(limitBefore)}.`);
  }
  return { ...base, proceedsUsd: 0, feeUsd: fee, bookValueUsd: 0, cashAfterUsd: cash - fee, monthlySavingUsd: leasePaymentMonthlyUsd(state, ac, type) + overheadMonthly };
}
