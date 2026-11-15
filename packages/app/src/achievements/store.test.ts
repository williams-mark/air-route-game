import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "@arg/sim";
import { RealSimBridge } from "../sim/realBridge";
import { MockSimBridge } from "../sim/bridge";
import type { Platform } from "../platform";
import { disabledByUrl, installTracker, parseSaved, STORAGE_KEY, useAchievements, type TrackerDeps } from "./store";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
}

function fakePlatform(kind: "web" | "desktop", result: boolean | (() => boolean) = false) {
  const calls: string[] = [];
  const platform = {
    kind,
    unlockAchievement: async (id: string) => { calls.push(id); return typeof result === "function" ? result() : result; },
  } as unknown as Platform;
  return { platform, calls };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const draft = { origin: "LAX", destination: "SEA", weeklyFrequency: 1, fares: { Y: 110 }, typeId: "B737-800" };

function setup(over: Partial<TrackerDeps> & { platform: Platform }) {
  const bridge = new RealSimBridge({ startPaused: true, initial: startingScenario(airports, aircraftTypes, 3, { campaignYears: 15 }) });
  const notes: string[] = [];
  const deps: TrackerDeps = { bridge, search: "", startOpen: () => false, onStartOpenChange: () => () => undefined, notify: (t) => notes.push(t), ...over };
  return { bridge, notes, deps };
}

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  useAchievements.setState({ unlocked: [], pending: [], progress: null, enabled: true, retried: false });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("unlock tracker", () => {
  it("calls the platform once per earned id, tells the player, and records it", async () => {
    const { platform, calls } = fakePlatform("web");
    const { bridge, notes, deps } = setup({ platform });
    const off = installTracker(deps);
    expect(useAchievements.getState().unlocked).toEqual([]);
    bridge.dispatch({ kind: "openRoute", route: draft });
    await flush();
    expect(calls).toEqual(["FIRST_ROUTE"]);
    expect(useAchievements.getState().unlocked).toEqual(["FIRST_ROUTE"]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Open for Business");
    // More days and more snapshots do not repeat the call.
    bridge.stepDays(3);
    bridge.stepDays(3);
    await flush();
    expect(calls).toEqual(["FIRST_ROUTE"]);
    expect(notes).toHaveLength(1);
    off();
  });

  it("on the web a false result is not retried later and nothing is pending", async () => {
    const { platform } = fakePlatform("web", false);
    const { bridge, deps } = setup({ platform });
    installTracker(deps);
    bridge.dispatch({ kind: "openRoute", route: draft });
    await flush();
    expect(useAchievements.getState().unlocked).toEqual(["FIRST_ROUTE"]);
    expect(useAchievements.getState().pending).toEqual([]);
  });

  it("on the desktop a false result keeps the id pending and the next app start retries it once", async () => {
    const first = fakePlatform("desktop", false);
    const a = setup({ platform: first.platform });
    const off = installTracker(a.deps);
    a.bridge.dispatch({ kind: "openRoute", route: draft });
    await flush();
    expect(first.calls).toEqual(["FIRST_ROUTE"]);
    expect(useAchievements.getState().unlocked).toEqual(["FIRST_ROUTE"]);
    expect(useAchievements.getState().pending).toEqual(["FIRST_ROUTE"]);
    off();

    // Next launch: state comes back from storage, Steam is available now.
    const saved = parseSaved(storage.getItem(STORAGE_KEY));
    expect(saved.pending).toEqual(["FIRST_ROUTE"]);
    useAchievements.setState({ ...saved, retried: false });
    const second = fakePlatform("desktop", true);
    const b = setup({ platform: second.platform });
    const off2 = installTracker(b.deps);
    await flush();
    expect(second.calls).toEqual(["FIRST_ROUTE"]);
    expect(useAchievements.getState().pending).toEqual([]);
    expect(parseSaved(storage.getItem(STORAGE_KEY)).pending).toEqual([]);
    off2();
    // Installing again in the same session (React strict mode) does not retry.
    installTracker(setup({ platform: second.platform }).deps);
    await flush();
    expect(second.calls).toEqual(["FIRST_ROUTE"]);
  });

  it("a platform call that throws counts as not confirmed", async () => {
    const platform = { kind: "desktop", unlockAchievement: async () => { throw new Error("steam gone"); } } as unknown as Platform;
    const { bridge, deps } = setup({ platform });
    installTracker(deps);
    bridge.dispatch({ kind: "openRoute", route: draft });
    await flush();
    expect(useAchievements.getState().pending).toEqual(["FIRST_ROUTE"]);
  });

  it("already unlocked ids are not sent again, even in a new session", async () => {
    useAchievements.setState({ unlocked: ["FIRST_ROUTE"] });
    const { platform, calls } = fakePlatform("desktop", true);
    const { bridge, notes, deps } = setup({ platform });
    installTracker(deps);
    bridge.dispatch({ kind: "openRoute", route: draft });
    await flush();
    expect(calls).toEqual([]);
    expect(notes).toEqual([]);
  });

  it("evaluates nothing while the start screen is up", async () => {
    const { platform, calls } = fakePlatform("web");
    let open = true;
    const { bridge, deps } = setup({ platform, startOpen: () => open });
    installTracker(deps);
    bridge.dispatch({ kind: "openRoute", route: draft });
    await flush();
    expect(calls).toEqual([]);
    expect(useAchievements.getState().progress).toBeNull();
    open = false;
    bridge.stepDays(1);
    await flush();
    // The first sighting of the game is after the route was opened, so that route is part of the baseline.
    expect(useAchievements.getState().progress).not.toBeNull();
  });

  it("is off in mock mode and for dev scenarios", async () => {
    expect(disabledByUrl("?mock=1")).toBe(true);
    expect(disabledByUrl("?fleetdemo")).toBe(true);
    expect(disabledByUrl("?stress=500")).toBe(true);
    expect(disabledByUrl("?ff=300")).toBe(true);
    expect(disabledByUrl("?seed=5&paused")).toBe(false);
    const { platform, calls } = fakePlatform("web");
    const mock = new MockSimBridge({ startPaused: true });
    installTracker({ bridge: mock, platform, search: "?mock=1", startOpen: () => false, onStartOpenChange: () => () => undefined, notify: () => undefined });
    expect(useAchievements.getState().enabled).toBe(false);
    mock.dispatch({ kind: "openRoute", route: draft });
    const real = setup({ platform, search: "?fleetdemo" });
    installTracker(real.deps);
    real.bridge.dispatch({ kind: "openRoute", route: draft });
    await flush();
    expect(calls).toEqual([]);
    expect(useAchievements.getState().unlocked).toEqual([]);
  });

  it("survives unavailable or damaged storage", () => {
    expect(parseSaved(null)).toEqual({ unlocked: [], pending: [], progress: null });
    expect(parseSaved("not json")).toEqual({ unlocked: [], pending: [], progress: null });
    expect(parseSaved(JSON.stringify({ unlocked: ["A", 3], pending: "x", progress: { gameKey: 1 } }))).toEqual({ unlocked: ["A"], pending: [], progress: null });
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(() => useAchievements.setState({ unlocked: ["X"] })).not.toThrow();
  });
});
