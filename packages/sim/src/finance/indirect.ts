// The player's indirect cost in the world field. Pure. See MODEL.md "Passive start in the world field".
import { ARCHETYPES } from "../rivals/config";

/**
 * Share of the player's revenue charged each day in the world field for the costs the route ledger does not carry: HQ, sales, IT,
 * labour above flight and cabin crew, insurance. It is the same share the world field's network carriers pay (ARCHETYPES.legacy
 * `indirectCostPct`, RIVALS.md); the world-only extra (`WORLD_FIELD.extraIndirectPct`) is not applied to the player. Without it a
 * passive player keeps an overhead advantage of about 25 points of revenue over every rival on the same markets and earns 20-30% while
 * they earn 5-15% (balance probe, 22 Nov 2026). The classic field keeps its original calibration (corporate overhead only).
 */
export const WORLD_PLAYER_INDIRECT_PCT = ARCHETYPES.legacy.indirectCostPct;

/** The player's indirect cost for a day with this revenue, USD: zero outside the world field. */
export function playerIndirectUsd(state: { rivals: { field?: "classic" | "world" } | null }, revenue: number): number {
  return state.rivals?.field === "world" ? Math.max(0, revenue) * WORLD_PLAYER_INDIRECT_PCT : 0;
}
