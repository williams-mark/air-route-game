// Pure rules for the route creator's "Move aircraft to <origin>" flow: which aircraft can be rebased, and what the callout says.
import type { Id } from "@arg/contracts";
import type { FleetItem } from "../sim/bridge";

export interface MoveCandidate {
  id: Id;
  tail: string;
  typeId: Id;
  typeName: string;
  ageYears: number;
  hub: Id | undefined;
  /** Weekly block hours the aircraft would add at the new hub (an idle aircraft is fully free). */
  freeHours: number;
  eligible: boolean;
  /** Why it cannot be moved (absent when eligible). */
  reason?: string;
}

const STATUS_REASON: Record<FleetItem["status"], string | null> = {
  active: null,
  delivery: "On order; it can be moved once delivered.",
  maintenance: "In the hangar; it can be moved when it is back in service.",
  stored: "Stored; only active aircraft can be based at a hub.",
};

/**
 * Aircraft that could be rebased to `target`: everything not already there. Eligible means active and flying no route
 * (the sim does not re-check routes, so this is the guard). `capacityHours(typeId)` is a type's weekly block hours per aircraft.
 * Eligible rows come first, the draft's type first within each group.
 */
export function moveCandidates(fleet: readonly FleetItem[], target: Id, capacityHours: (typeId: Id) => number, preferTypeId?: Id): MoveCandidate[] {
  const rows = fleet.filter((a) => a.hub !== target).map((a): MoveCandidate => {
    const statusReason = STATUS_REASON[a.status];
    const reason = statusReason ?? (a.routes.length > 0 ? `Flies ${a.routes.join(", ")}; remove it from its routes first.` : null);
    return {
      id: a.id, tail: a.tail, typeId: a.typeId, typeName: a.typeName, ageYears: a.ageYears, hub: a.hub,
      freeHours: reason ? 0 : capacityHours(a.typeId), eligible: reason === null, ...(reason ? { reason } : {}),
    };
  });
  const rank = (c: MoveCandidate) => (c.eligible ? 0 : 2) + (preferTypeId && c.typeId === preferTypeId ? 0 : 1);
  return rows.sort((x, y) => rank(x) - rank(y) || x.tail.localeCompare(y.tail));
}

export type HubCalloutState =
  | { kind: "none" }
  | { kind: "unlock" }
  | { kind: "none_based"; typeId: Id }
  | { kind: "short"; typeId: Id; shortBy: number };

/** What the creator should say about the origin hub for the draft (type and block-hour figures from routeHourSummary). */
export function hubCallout(input: { originOwned: boolean; typeId: Id; available: number; needed: number; free: number }): HubCalloutState {
  if (!input.originOwned) return { kind: "unlock" };
  if (!input.typeId) return { kind: "none" };
  if (input.available <= 1e-9) return { kind: "none_based", typeId: input.typeId };
  if (input.needed > input.free + 1e-9) return { kind: "short", typeId: input.typeId, shortBy: input.needed - input.free };
  return { kind: "none" };
}
