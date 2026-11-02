import type { WorldState } from "@arg/contracts";
import { makeRng } from "./rng";

export { makeRng };

export function newWorld(seed: number): WorldState {
  return { seed, day: 0, playerId: "player", cash: 100_000_000, routes: [], fleet: [] };
}

/** Advance one day. Pure: returns a new state. */
export function stepDay(state: WorldState): WorldState {
  return { ...state, day: state.day + 1 };
}
