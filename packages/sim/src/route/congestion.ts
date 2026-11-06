// Hub slots, terminals and slot fees (lane/sim-policy). Pure and deterministic; see MODEL.md "lane/sim-policy".
import type { Airport, HubCongestion, Id, Route, Terminal } from "@arg/contracts";
import { makeRng, mixSeed } from "../rng";
import type { LedgerLine } from "../finance/ledger";
import type { SimState } from "../state";

export const SLOT_PARAMS = {
  /** Operating hours per day a slot-coordinated airport schedules movements (06:00-24:00). [E] */
  operatingHoursPerDay: 18,
  daysPerWeek: 7,
  /** One weekly round trip = 1 departure + 1 arrival at each end = 2 slots a week at each airport. */
  slotsPerRoundTrip: 2,
  /** Share of an airport's weekly slots used by other traffic (cargo, GA, airlines outside the model), by slotsPerHour. [E] */
  backgroundShare: [{ minSlotsPerHour: 80, share: 0.5 }, { minSlotsPerHour: 40, share: 0.4 }, { minSlotsPerHour: 20, share: 0.3 }, { minSlotsPerHour: 0, share: 0.2 }] as const,
  /** Seeded jitter on the background share (+- fraction of itself); fixed per (seed, airport), not per day. */
  backgroundJitter: 0.1,
  /** Base fee per slot (one movement) in USD, by slotsPerHour: terminal, gate and slot-coordination charges on top of landing fees. [E] */
  baseSlotFeeUsd: [{ minSlotsPerHour: 80, usd: 140 }, { minSlotsPerHour: 40, usd: 100 }, { minSlotsPerHour: 20, usd: 70 }, { minSlotsPerHour: 0, usd: 45 }] as const,
  implicitTerminalId: "MAIN",
} as const;

export const weeklySlotsTotal = (a: Airport): number =>
  Math.round(a.slotsPerHour * SLOT_PARAMS.operatingHoursPerDay * SLOT_PARAMS.daysPerWeek);

export const baseSlotFeeUsd = (a: Airport): number => SLOT_PARAMS.baseSlotFeeUsd.find((t) => a.slotsPerHour >= t.minSlotsPerHour)!.usd;

/** Terminals of an airport; the implicit single terminal "MAIN" (fee multiplier 1, whole slot share) when the data has none. */
export function terminalsOf(a: Airport): Terminal[] {
  if (a.terminals && a.terminals.length > 0) return a.terminals;
  return [{ id: SLOT_PARAMS.implicitTerminalId, name: "Main terminal", feeMultiplier: 1, premium: false, slotShare: 1, source: "implicit: airport has no terminal data" }];
}

/** Default terminal: the first non-premium one, else the first. */
export const defaultTerminalOf = (a: Airport): Terminal => terminalsOf(a).find((t) => !t.premium) ?? terminalsOf(a)[0]!;

/** The terminal the player uses at an airport: world.hubTerminals choice when valid, else the default. */
export function playerTerminalOf(state: Pick<SimState, "world">, a: Airport): Terminal {
  const chosen = state.world.hubTerminals?.[a.id];
  return terminalsOf(a).find((t) => t.id === chosen) ?? defaultTerminalOf(a);
}

/** Slots per week a route uses at one of its ends. */
export const routeSlots = (r: Pick<Route, "weeklyFrequency">): number => SLOT_PARAMS.slotsPerRoundTrip * r.weeklyFrequency;

/** Player slots a week at an airport (routes touching it), optionally leaving one route out. */
export function playerSlotsAt(state: Pick<SimState, "world">, airportId: Id, excludeRouteId?: Id): number {
  let n = 0;
  for (const r of state.world.routes) if (r.id !== excludeRouteId && (r.origin === airportId || r.destination === airportId)) n += routeSlots(r);
  return n;
}

/** Rival slots a week at an airport: active modelled rivals' routes touching it. */
export function rivalSlotsAt(state: Pick<SimState, "rivals">, airportId: Id): number {
  let n = 0;
  for (const air of state.rivals?.airlines ?? []) {
    if (air.status !== "active") continue;
    for (const r of air.routes) if (r.origin === airportId || r.destination === airportId) n += SLOT_PARAMS.slotsPerRoundTrip * r.frequency;
  }
  return n;
}

/** Background traffic estimate (slots a week): size-band share of the weekly total with seeded jitter. [E] */
export function backgroundSlots(seed: number, a: Airport): number {
  let h = 0;
  for (let i = 0; i < a.id.length; i++) h = (h * 31 + a.id.charCodeAt(i)) >>> 0;
  const share = SLOT_PARAMS.backgroundShare.find((t) => a.slotsPerHour >= t.minSlotsPerHour)!.share;
  const j = (makeRng(mixSeed(seed, 0x51075 + h))() - 0.5) * 2 * SLOT_PARAMS.backgroundJitter;
  return Math.round(weeklySlotsTotal(a) * share * (1 + j));
}

/**
 * Slot picture of one airport, derived (never saved). slotsPerWeekTotal = slotsPerHour x 18 operating hours x 7. Used: the
 * player's routes (2 slots per weekly round trip at each end), modelled rivals' routes, and the seeded background estimate.
 * slotsAvailable = total - usedByAll, at least 0. Each terminal has capacity total x slotShare; the player's slots all sit in
 * the terminal it occupies there (`hubTerminals`, default first non-premium), and weeklyFeeUsd = those slots x base slot fee x feeMultiplier.
 */
export function hubCongestion(state: SimState, airportId: Id): HubCongestion {
  const a = state.airports.find((x) => x.id === airportId);
  const empty: HubCongestion = { airportId, slotsPerWeekTotal: 0, slotsUsedByPlayer: 0, slotsUsedByAll: 0, slotsAvailable: 0, terminals: [] };
  if (!a) return empty;
  const total = weeklySlotsTotal(a);
  const player = playerSlotsAt(state, a.id);
  const all = player + rivalSlotsAt(state, a.id) + backgroundSlots(state.world.seed, a);
  const mine = playerTerminalOf(state, a);
  return {
    airportId: a.id,
    slotsPerWeekTotal: total,
    slotsUsedByPlayer: player,
    slotsUsedByAll: all,
    slotsAvailable: Math.max(0, total - all),
    terminals: terminalsOf(a).map((t) => {
      const slots = t.id === mine.id ? player : 0;
      return { terminalId: t.id, slotsUsedByPlayer: slots, slotsCapacity: Math.round(total * t.slotShare), weeklyFeeUsd: slots * baseSlotFeeUsd(a) * t.feeMultiplier };
    }),
  };
}

/** Weekly slot and terminal fees over every airport the player's routes touch, with the ledger line. */
export function weeklySlotFees(state: SimState): { total: number; byAirport: { airportId: Id; terminalId: Id; slots: number; feeUsd: number }[]; line: LedgerLine } {
  const ids = new Set<Id>();
  for (const r of state.world.routes) { ids.add(r.origin); ids.add(r.destination); }
  const byAirport: { airportId: Id; terminalId: Id; slots: number; feeUsd: number }[] = [];
  for (const id of [...ids].sort()) {
    const a = state.airports.find((x) => x.id === id);
    if (!a) continue;
    const t = playerTerminalOf(state, a);
    const slots = playerSlotsAt(state, id);
    byAirport.push({ airportId: id, terminalId: t.id, slots, feeUsd: slots * baseSlotFeeUsd(a) * t.feeMultiplier });
  }
  const total = byAirport.reduce((s, x) => s + x.feeUsd, 0);
  return {
    total, byAirport,
    line: { key: "slotFees", label: "Slot and terminal fees", group: "cost", weekly: total, formula: `${byAirport.reduce((s, x) => s + x.slots, 0)} slots/wk x base slot fee by airport size x terminal multiplier (estimate; on top of landing fees)` },
  };
}
