// Weekly reputation step and the policy command (policy/product.ts). Pure.
import type { Day, SimEvent } from "@arg/contracts";
import type { SimState } from "../state";
import { PRODUCT_PARAMS, BANDS, bandOf, defaultProduct, policyError, productOf, satisfactionOf, stepReputation, type Band, type ProductPolicy } from "./product";

/** Reputation thresholds the player is told about when crossed (game-design labels). */
export const REPUTATION_LABELS: ReadonlyArray<readonly [number, string]> = [[0.5, "excellent"], [0.15, "good"], [-0.15, "as expected"], [-0.5, "poor"], [-1.01, "very poor"]];
export const reputationLabel = (r: number): string => REPUTATION_LABELS.find(([t]) => r >= t)?.[1] ?? "very poor";

/** Passengers per week by band over the player's routes (from the latest reports). */
export function passengersByBand(state: SimState): Record<Band, number> {
  const out = Object.fromEntries(BANDS.map((b) => [b, 0])) as Record<Band, number>;
  for (const r of state.world.routes) {
    const rep = state.routeReports[r.id];
    if (!rep) continue;
    out[bandOf(rep.evaluation.distanceKm)] += rep.evaluation.passengersPerWeek;
  }
  return out;
}

/** Each week (day divisible by 7): reputation moves toward satisfaction with the current policy. Only once a policy has been set. */
export function stepProduct(state: SimState, day: Day): SimState {
  if (!state.product || day % 7 !== 0) return state;
  const before = state.product.reputation;
  const product = stepReputation(state.product, satisfactionOf(state.product.policy, passengersByBand(state)), day);
  const was = reputationLabel(before), now = reputationLabel(product.reputation);
  const events: SimEvent[] = was === now ? [] : [{ kind: "notice", day, text: `Customer reputation is now ${now} (it was ${was}). ${product.reputation > before ? "Passengers like your service and fees." : "Passengers are unhappy with your service or fees."} See Policies.` }];
  const next = { ...state, product };
  return events.length > 0 ? { ...next, pendingEvents: [...next.pendingEvents, ...events].slice(-next.params.eventQueueLimit) } : next;
}

/** Set the airline's product policy (service and fees by band). Takes effect on the next simulated day; reputation follows over weeks. */
export function setProductPolicy(state: SimState, policy: ProductPolicy): { state: SimState; error: string | null } {
  const err = policyError(policy);
  if (err) return { state, error: err };
  const cur = productOf(state);
  const clean: ProductPolicy = structuredClone(policy);
  return { state: { ...state, product: { ...(state.product ?? defaultProduct()), ...cur, policy: clean } }, error: null };
}

/** Where reputation is heading: its value after `weeks` more weeks at today's satisfaction. */
export function projectedReputation(reputation: number, satisfaction: number, weeks: number): number {
  return satisfaction + (reputation - satisfaction) * Math.pow(1 - PRODUCT_PARAMS.reputationStep, weeks);
}
