// Unlock bookkeeping. Keeps the ids already unlocked (per browser profile, so repeated platform calls are avoided), the ids Steam has not
// confirmed yet (desktop only) and the evaluator's per-game progress; watches the bridge and unlocks newly earned ids through the platform.
import { create } from "zustand";
import type { SimBridge } from "../sim/bridge";
import type { Platform } from "../platform";
import { achievementById } from "./definitions";
import { evaluate, type Progress } from "./evaluate";
import { factsFrom } from "./facts";

export const STORAGE_KEY = "arg-achievements-v1";

interface Saved {
  /** Ids earned on this profile. */
  unlocked: string[];
  /** Earned ids the platform did not confirm (Steam unavailable at the time); retried once at the next app start. */
  pending: string[];
  progress: Progress | null;
}

interface AchievementState extends Saved {
  /** False in mock mode and dev scenarios: nothing is evaluated or unlocked. */
  enabled: boolean;
  /** The pending list has been retried in this app session. */
  retried: boolean;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function parseSaved(raw: string | null): Saved {
  const empty: Saved = { unlocked: [], pending: [], progress: null };
  if (!raw) return empty;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const p = o.progress as Partial<Progress> | null | undefined;
    const progress: Progress | null = p && typeof p.gameKey === "string" && typeof p.firstDay === "number" && typeof p.lastDay === "number" && typeof p.distressSeen === "boolean"
      ? { gameKey: p.gameKey, firstDay: p.firstDay, lastDay: p.lastDay, distressSeen: p.distressSeen, baselineRouteIds: strings(p.baselineRouteIds) }
      : null;
    return { unlocked: strings(o.unlocked), pending: strings(o.pending), progress };
  } catch {
    return empty;
  }
}

function readSaved(): Saved {
  try { return parseSaved(localStorage.getItem(STORAGE_KEY)); } catch { return parseSaved(null); }
}

function persist(s: Saved): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked: s.unlocked, pending: s.pending, progress: s.progress })); } catch { /* storage unavailable: keep going in memory */ }
}

export const useAchievements = create<AchievementState>(() => ({ ...readSaved(), enabled: true, retried: false }));

const save = () => persist(useAchievements.getState());

/** Mock mode and the dev scenarios (fleet demo, fast-forward, stress airports) never count. */
export function disabledByUrl(search: string): boolean {
  const q = new URLSearchParams(search);
  return ["mock", "fleetdemo", "stress", "ff"].some((k) => q.has(k));
}

async function callPlatform(platform: Platform, id: string): Promise<boolean> {
  try { return await platform.unlockAchievement(id); } catch { return false; }
}

/** Retry the ids Steam has not confirmed. Runs once per app session. */
export function retryPending(platform: Platform): void {
  const { retried, pending } = useAchievements.getState();
  if (retried) return;
  useAchievements.setState({ retried: true });
  for (const id of pending) {
    void callPlatform(platform, id).then((ok) => {
      if (!ok) return;
      useAchievements.setState((s) => ({ pending: s.pending.filter((p) => p !== id) }));
      save();
    });
  }
}

/** Record `id` as unlocked, tell the player, and pass it to the platform once. */
function unlock(id: string, platform: Platform, notify: (text: string) => void): void {
  useAchievements.setState((s) => ({ unlocked: [...s.unlocked, id] }));
  save();
  const def = achievementById(id);
  notify(def ? `Achievement unlocked: ${def.name}. ${def.description}` : `Achievement unlocked: ${id}`);
  void callPlatform(platform, id).then((ok) => {
    // Only the desktop app has anything to catch up on; in a browser the platform call is always a no-op.
    if (ok || platform.kind !== "desktop") return;
    useAchievements.setState((s) => (s.pending.includes(id) ? s : { pending: [...s.pending, id] }));
    save();
  });
}

export interface TrackerDeps {
  bridge: SimBridge;
  platform: Platform;
  search: string;
  /** True while the start screen is up (nothing is evaluated then). */
  startOpen: () => boolean;
  /** Subscribe to changes of `startOpen`; returns the unsubscribe function. */
  onStartOpenChange: (l: () => void) => () => void;
  notify: (text: string) => void;
}

/**
 * Evaluate the game when its day, routes, hubs or campaign review change (not on every snapshot: speed changes and the like are ignored),
 * and unlock what is newly earned. Each evaluation is a few hundred array reads, once per simulated day. Returns the cleanup function.
 */
export function installTracker(d: TrackerDeps): () => void {
  const enabled = !disabledByUrl(d.search) && typeof d.bridge.getSim === "function" && d.bridge.getSim() != null;
  useAchievements.setState({ enabled });
  if (!enabled) return () => undefined;
  retryPending(d.platform);

  let seen: readonly unknown[] = [];
  const tick = () => {
    const open = d.startOpen();
    const sim = d.bridge.getSim?.();
    if (open || !sim) { seen = []; return; }
    const snap = d.bridge.getState();
    const key = [snap.day, snap.routes, sim.world.ownedHubs, snap.review];
    if (key.length === seen.length && key.every((v, i) => v === seen[i])) return;
    seen = key;

    const before = useAchievements.getState();
    const { earned, progress } = evaluate(factsFrom(snap, sim), before.progress);
    const old = before.progress;
    const changed = !old || old.gameKey !== progress.gameKey || old.firstDay !== progress.firstDay || old.distressSeen !== progress.distressSeen;
    useAchievements.setState({ progress });
    if (changed) save();
    const have = new Set(before.unlocked);
    for (const id of earned) if (!have.has(id)) unlock(id, d.platform, d.notify);
  };

  const offBridge = d.bridge.subscribe(tick);
  const offUi = d.onStartOpenChange(tick);
  tick();
  return () => { offBridge(); offUi(); };
}
