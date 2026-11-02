import { useSyncExternalStore } from "react";
import { createBridge, type SimBridge, type SimSnapshot, type Speed } from "./bridge";

export const bridge: SimBridge = createBridge();

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
