import type { AircraftType, CabinClass, CabinLayout, Day, Id } from "@arg/contracts";
import { notice, pushEvents, type CommandError } from "../commands";
import type { SimState } from "../state";
import { validateLayout } from "./rules";

/** Cabin refit: takes the aircraft out of service, costs per seat (cash paid at order). */
export const REFIT_PARAMS = {
  downtimeDays: { narrow: 5, wide: 14 },
  /** USD per new seat installed, by class and body. Estimates, not sourced. */
  usdPerSeat: {
    F: { narrow: 45_000, wide: 90_000 },
    J: { narrow: 18_000, wide: 60_000 },
    W: { narrow: 8_000, wide: 12_000 },
    Y: { narrow: 2_500, wide: 3_000 },
  } as Record<CabinClass, { narrow: number; wide: number }>,
  /** Fixed cost per refit (certification, ferry, labour mobilisation). */
  fixedUsd: { narrow: 60_000, wide: 180_000 },
} as const;

export type CabinCommand = { kind: "refitAircraft"; aircraftId: Id; layout: CabinLayout };

export interface RefitQuote { downtimeDays: number; costUsd: number; seats: number }

/** Cost and downtime of fitting `layout` to a `type` aircraft (every seat of the new layout is installed). */
export function refitQuote(type: AircraftType, layout: CabinLayout): RefitQuote {
  const k = type.widebody ? "wide" : "narrow";
  let cost: number = REFIT_PARAMS.fixedUsd[k];
  let seats = 0;
  for (const s of layout.sections) { const n = s.rows * s.seatsAcross; seats += n; cost += n * REFIT_PARAMS.usdPerSeat[s.cls][k]; }
  return { downtimeDays: REFIT_PARAMS.downtimeDays[k], costUsd: Math.round(cost), seats };
}

/** True when two layouts have the same sections (class, rows, seats across, pitch), in the same order. */
export function sameLayout(a: CabinLayout | undefined, b: CabinLayout | undefined): boolean {
  if (!a || !b || a.sections.length !== b.sections.length) return false;
  return a.sections.every((s, i) => {
    const t = b.sections[i]!;
    return s.cls === t.cls && s.rows === t.rows && s.seatsAcross === t.seatsAcross && s.pitchIn === t.pitchIn;
  });
}

export type RefitResult =
  | { ok: true; kind: "refitAircraft"; aircraftId: Id; costUsd: number; downtimeDays: number; returnDay: Day }
  | CommandError;

const fail = (error: CommandError["error"], message: string): CommandError => ({ ok: false, error, message });

export function applyRefit(state: SimState, cmd: CabinCommand): { state: SimState; result: RefitResult } {
  const ac = state.world.fleet.find((a) => a.id === cmd.aircraftId);
  if (!ac) return { state, result: fail("unknown_aircraft", `No aircraft "${cmd.aircraftId}".`) };
  const type = state.aircraftTypes.find((t) => t.id === ac.typeId);
  if (!type) return { state, result: fail("unknown_type", `Unknown aircraft type "${ac.typeId}".`) };
  if (ac.status !== "active" && ac.status !== "stored") {
    return { state, result: fail("aircraft_unavailable", `${ac.tailNumber} is ${ac.status === "delivery" ? "not yet delivered" : "in a check or refit"} and cannot be refitted now.`) };
  }
  const v = validateLayout(type, cmd.layout);
  if (!v.ok) return { state, result: fail("invalid_layout", v.errors[0]!.message) };
  if (sameLayout(ac.layout, cmd.layout)) return { state, result: fail("no_change", `${ac.tailNumber} already has this cabin layout; change something before refitting.`) };
  const q = refitQuote(type, cmd.layout);
  if (q.costUsd > state.world.cash) return { state, result: fail("insufficient_cash", `A refit costs $${Math.round(q.costUsd / 1000)}k; you have $${Math.round(state.world.cash / 1000)}k.`) };
  const day = state.world.day;
  const returnDay = day + q.downtimeDays;
  const fleet = state.world.fleet.map((a) => (a.id === ac.id ? { ...a, layout: cmd.layout, status: "maintenance" as const } : a));
  const meta = state.fleetMeta[ac.id];
  const fleetMeta = meta
    ? { ...state.fleetMeta, [ac.id]: { ...meta, maintenance: { check: "A" as const, startDay: day, endDay: returnDay, cost: q.costUsd, refit: true } } }
    : state.fleetMeta;
  const next = pushEvents(
    { ...state, world: { ...state.world, fleet, cash: state.world.cash - q.costUsd }, fleetMeta },
    [notice(state, `${ac.tailNumber} (${ac.typeId}) enters a cabin refit: ${q.seats} seats, ${q.downtimeDays} days, $${(q.costUsd / 1e6).toFixed(2)}M.`)],
  );
  return { state: next, result: { ok: true, kind: "refitAircraft", aircraftId: ac.id, costUsd: q.costUsd, downtimeDays: q.downtimeDays, returnDay } };
}
