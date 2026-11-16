import { afterEach, describe, expect, it, vi } from "vitest";
import { RealSimBridge } from "../sim/realBridge";
import { loadFromSlot, saveToSlot } from "../save/saves";
import { ALL_SLOTS } from "../save/store";
import { getPlatform, setPlatformForTests } from "./index";
import type { DesktopBridge } from "./desktopBridge";
import { createDesktopPlatform, metaFromText, slotKey } from "./desktop";

const KEY = /^[A-Za-z0-9_-]{1,64}$/;

function fakeBridge() {
  const files = new Map<string, string>();
  const calls = { fullscreen: [] as boolean[], quit: 0, achievements: [] as string[] };
  const bridge: DesktopBridge = {
    version: "test",
    saves: {
      list: async () => [...files].map(([key, text]) => ({ key, bytes: text.length, modifiedMs: 1 })),
      read: async (key) => { if (!KEY.test(key)) throw new Error("bad key"); return files.get(key) ?? null; },
      write: async (key, text) => { if (!KEY.test(key)) throw new Error("bad key"); files.set(key, text); },
      remove: async (key) => { files.delete(key); },
    },
    window: { isFullscreen: async () => calls.fullscreen.at(-1) ?? false, setFullscreen: async (on) => { calls.fullscreen.push(on); }, quit: async () => { calls.quit++; } },
    steam: { available: async () => true, unlockAchievement: async (id) => { calls.achievements.push(id); return true; } },
  };
  return { bridge, files, calls };
}

afterEach(() => { setPlatformForTests(null); vi.unstubAllGlobals(); });

describe("platform selection", () => {
  it("is web without window.argDesktop", () => {
    vi.stubGlobal("window", {});
    const p = getPlatform();
    expect(p.kind).toBe("web");
    expect(p.canQuit).toBe(false);
  });

  it("is desktop when window.argDesktop exists, and is cached", () => {
    vi.stubGlobal("window", { argDesktop: fakeBridge().bridge });
    const p = getPlatform();
    expect(p.kind).toBe("desktop");
    expect(getPlatform()).toBe(p);
  });

  it("accepts an injected platform", () => {
    const p = createDesktopPlatform(fakeBridge().bridge);
    setPlatformForTests(p);
    expect(getPlatform()).toBe(p);
  });

  it("web fallbacks are inert", async () => {
    vi.stubGlobal("window", {});
    const p = getPlatform();
    await expect(p.quit()).resolves.toBeUndefined();
    await expect(p.unlockAchievement("x")).resolves.toBe(false);
    await expect(p.fullscreen.get()).resolves.toBe(false);
  });
});

describe("desktop platform", () => {
  it("uses valid file keys for every slot", () => {
    for (const s of ALL_SLOTS) expect(slotKey(s)).toMatch(KEY);
    expect(new Set(ALL_SLOTS.map(slotKey)).size).toBe(ALL_SLOTS.length);
  });

  it("round-trips a game through a slot, lists metadata and removes it", async () => {
    const { bridge, files } = fakeBridge();
    const p = createDesktopPlatform(bridge);
    const a = new RealSimBridge({ seed: 2015, startPaused: true });
    a.stepDays(40);
    expect((await saveToSlot(a, "3", p.saves)).ok).toBe(true);
    expect((await saveToSlot(a, "auto", p.saves)).ok).toBe(true);
    expect([...files.keys()].sort()).toEqual(["slot-3", "slot-auto"]);

    const metas = await p.saves.list();
    expect(metas.map((m) => m.slot).sort()).toEqual(["3", "auto"]);
    expect(metas.find((m) => m.slot === "3")).toMatchObject({ day: 40, seed: 2015, airline: a.serialize().state.airlineName });

    const b = new RealSimBridge({ seed: 999, startPaused: true });
    expect((await loadFromSlot(b, "3", p.saves)).ok).toBe(true);
    expect(b.getState().day).toBe(40);

    await p.saves.remove("3");
    expect(await p.saves.read("3")).toBeNull();
    expect((await loadFromSlot(b, "3", p.saves)).ok).toBe(false);
    expect((await p.saves.list()).map((m) => m.slot)).toEqual(["auto"]);
  });

  it("leaves unknown, unreadable and invalid files out of the list", async () => {
    const { bridge, files } = fakeBridge();
    const p = createDesktopPlatform(bridge);
    files.set("slot-1", "{not json");
    files.set("slot-2", JSON.stringify({ savedAt: "x" }));
    files.set("notes", "{}");
    expect(await p.saves.list()).toEqual([]);
    expect(await p.saves.read("5")).toBeNull();
    expect(metaFromText("1", "null", 4)).toBeNull();
  });

  it("forwards window, quit and achievement calls", async () => {
    const { bridge, calls } = fakeBridge();
    const p = createDesktopPlatform(bridge);
    await p.fullscreen.set(true);
    expect(await p.fullscreen.get()).toBe(true);
    await p.quit();
    expect(await p.unlockAchievement("A1")).toBe(true);
    expect(calls).toEqual({ fullscreen: [true], quit: 1, achievements: ["A1"] });
    expect(p.canQuit).toBe(true);
  });
});
