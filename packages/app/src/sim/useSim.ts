import { useSyncExternalStore } from "react";
import type { SimBridge, SimSnapshot, Speed } from "./bridge";
import { createBridge } from "./create";
import { useUi } from "../store";

export const bridge: SimBridge = createBridge();


/** Subscribe to a slice of the snapshot; re-renders only when the selected value changes (compare with ===). */
export function useSimSelector<T>(select: (s: SimSnapshot) => T): T {
  return useSyncExternalStore(bridge.subscribe, () => select(bridge.getState()), () => select(bridge.getState()));
}

export function useSim(): SimSnapshot {
  return useSyncExternalStore(bridge.subscribe, bridge.getState, bridge.getState);
}

let lastSpeed: Speed = 1;
export function setSpeed(s: Speed) {
  if (s > 0) lastSpeed = s;
  bridge.dispatch({ kind: "setSpeed", speed: s });
}
export function togglePause() {
  setSpeed(bridge.getState().speed === 0 ? lastSpeed : 0);
}
export function bumpSpeed(delta: number) {
  const cur = bridge.getState().speed;
  const base = cur === 0 ? lastSpeed : cur;
  const next = Math.min(5, Math.max(1, base + delta)) as Speed;
  setSpeed(next);
}
