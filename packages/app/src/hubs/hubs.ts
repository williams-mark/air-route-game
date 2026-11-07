// Pure helpers for the Hubs panel: congestion bar shares, terminal rows and the weekly fee a terminal move would change.
import type { Airport, HubCongestion, Id, Terminal } from "@arg/contracts";

/** Terminal fee tiers whose source starts with "estimate:" are the project's own estimates, not published figures. */
export const isEstimate = (source: string): boolean => source.trim().toLowerCase().startsWith("estimate:");

/** The implicit terminal the sim uses for airports without terminal data. */
export const isImplicit = (source: string): boolean => source.startsWith("implicit:");

export interface SlotBar {
  /** Shares of the weekly slot total, each 0..1, summing to at most 1. */
  mine: number;
  others: number;
  free: number;
  /** True when the airport is over capacity (used by all above the total). */
  over: boolean;
}

/** Split the weekly slots into yours, other airlines' and free. */
export function slotBar(c: Pick<HubCongestion, "slotsPerWeekTotal" | "slotsUsedByPlayer" | "slotsUsedByAll" | "slotsAvailable">): SlotBar {
  const total = Math.max(1, c.slotsPerWeekTotal);
  const mine = Math.min(1, c.slotsUsedByPlayer / total);
  const others = Math.max(0, Math.min(1 - mine, (c.slotsUsedByAll - c.slotsUsedByPlayer) / total));
  return { mine, others, free: Math.max(0, 1 - mine - others), over: c.slotsUsedByAll > c.slotsPerWeekTotal };
}

export interface TerminalRow {
  id: Id;
  name: string;
  feeMultiplier: number;
  premium: boolean;
  estimate: boolean;
  implicit: boolean;
  source: string;
  yours: boolean;
  slotsUsedByPlayer: number;
  slotsCapacity: number;
  /** Fee you pay a week at this terminal now (0 where you have no slots). */
  weeklyFeeUsd: number;
  /** Fee you would pay a week if all your slots here moved to this terminal. */
  feeIfMovedUsd: number;
  /** feeIfMovedUsd minus what you pay now; 0 for your own terminal. */
  deltaUsd: number;
}

/** One row per terminal of the airport (the sim's list, including the implicit MAIN), with the cost of moving there. */
export function terminalRows(terminals: readonly Terminal[], congestion: HubCongestion, currentId: Id, baseFeeUsd: number): TerminalRow[] {
  const mySlots = congestion.slotsUsedByPlayer;
  const nowFee = congestion.terminals.find((t) => t.terminalId === currentId)?.weeklyFeeUsd ?? 0;
  return terminals.map((t) => {
    const c = congestion.terminals.find((x) => x.terminalId === t.id);
    const yours = t.id === currentId;
    const feeIfMovedUsd = mySlots * baseFeeUsd * t.feeMultiplier;
    return {
      id: t.id, name: t.name, feeMultiplier: t.feeMultiplier, premium: t.premium, estimate: isEstimate(t.source), implicit: isImplicit(t.source),
      source: t.source, yours, slotsUsedByPlayer: c?.slotsUsedByPlayer ?? 0, slotsCapacity: c?.slotsCapacity ?? 0,
      weeklyFeeUsd: c?.weeklyFeeUsd ?? 0, feeIfMovedUsd, deltaUsd: yours ? 0 : feeIfMovedUsd - nowFee,
    };
  });
}

/** The hubs the congestion table lists: every player hub except the home hub, in the given order. */
export const otherHubs = (hubs: readonly Id[], home: Id): Id[] => hubs.filter((h) => h !== home);

/** Hub cards on the Hubs panel: the home hub first (its terminal is movable too), then the other player hubs. */
export const hubCardIds = (hubs: readonly Id[], home: Id): Id[] => [home, ...otherHubs([...new Set(hubs)].sort(), home)];

/** "+$1,200 a week" / "-$300 a week" / "no change". */
export function deltaText(deltaUsd: number): string {
  const r = Math.round(deltaUsd);
  if (r === 0) return "no change in weekly fees";
  const n = Math.abs(r).toLocaleString("en-US");
  return `${r > 0 ? "+" : "−"}$${n} a week`;
}

/** Runway bar for the schematic: longest runway as a share of the reference length (0..1, capped). Display only. */
export const RUNWAY_SCALE_M = 4500;
export const runwayShare = (runwayM: number): number => Math.max(0, Math.min(1, runwayM / RUNWAY_SCALE_M));

/** Short name for an airport row in the panel. */
export const hubTitle = (a: Pick<Airport, "id" | "city" | "name">): string => `${a.id} ${a.city || a.name}`;
