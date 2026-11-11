// Fleet commonality overhead. Pure and deterministic. See MODEL.md "Selling aircraft, lease returns and fleet diversity".
import type { Aircraft } from "@arg/contracts";
import { DIVERSITY_PARAMS } from "./lifecycle";
import type { SimState } from "../state";


const DAYS_PER_MONTH = 30.4375;

export interface FleetDiversity {
  /** Distinct aircraft types in the delivered fleet (aircraft still on order do not count). */
  types: number;
  /** Types beyond the free allowance. */
  extraTypes: number;
  freeTypes: number;
  /** Delivered aircraft. */
  fleetSize: number;
  /** Overhead per month and per day, USD (0 within the free allowance). */
  monthlyUsd: number;
  dailyUsd: number;
}

/** Commonality overhead of a list of aircraft (those with status "delivery" are not yet in service and are ignored). */
export function diversityOf(fleet: readonly Pick<Aircraft, "typeId" | "status">[]): FleetDiversity {
  const kinds = new Set<string>();
  let fleetSize = 0;
  for (const ac of fleet) {
    if (ac.status === "delivery") continue;
    kinds.add(ac.typeId);
    fleetSize++;
  }
  const extraTypes = Math.max(0, kinds.size - DIVERSITY_PARAMS.freeTypes);
  const monthlyUsd = extraTypes * (DIVERSITY_PARAMS.perExtraTypeMonthlyUsd + DIVERSITY_PARAMS.perExtraTypePerAircraftMonthlyUsd * fleetSize);
  return { types: kinds.size, extraTypes, freeTypes: DIVERSITY_PARAMS.freeTypes, fleetSize, monthlyUsd, dailyUsd: monthlyUsd / DAYS_PER_MONTH };
}

export const fleetDiversity = (state: Pick<SimState, "world">): FleetDiversity => diversityOf(state.world.fleet);
