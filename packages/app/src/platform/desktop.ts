import { ALL_SLOTS, type SaveStore, type SlotId, type SlotMeta } from "../save/store";
import type { DesktopBridge } from "./desktopBridge";
import type { Platform } from "./index";

// One file per slot, named slot-auto, slot-1 ... slot-5 (all valid keys: /^[A-Za-z0-9_-]{1,64}$/).
// The file holds exactly the save text that export writes. The slot list metadata is derived from that text, so nothing is stored twice.
const PREFIX = "slot-";
export const slotKey = (slot: SlotId) => PREFIX + slot;
const slotOfKey = (key: string): SlotId | null => ALL_SLOTS.find((s) => slotKey(s) === key) ?? null;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Slot metadata from save text, or null when the text is not a readable save (such files are left out of the list). */
export function metaFromText(slot: SlotId, text: string, bytes: number): SlotMeta | null {
  let o: unknown;
  try { o = JSON.parse(text); } catch { return null; }
  if (!isObj(o) || !isObj(o.state)) return null;
  const world = o.state.world;
  if (!isObj(world) || typeof world.day !== "number" || typeof world.cash !== "number") return null;
  if (typeof o.savedAt !== "string" || typeof o.seed !== "number") return null;
  return {
    slot, savedAt: o.savedAt, day: world.day, cash: world.cash,
    airline: typeof o.state.airlineName === "string" ? o.state.airlineName : "",
    seed: o.seed, appVersion: typeof o.appVersion === "string" ? o.appVersion : "", bytes,
  };
}

export function createDesktopSaveStore(bridge: DesktopBridge): SaveStore {
  return {
    async list() {
      const files = await bridge.saves.list();
      const metas = await Promise.all(files.map(async (f) => {
        const slot = slotOfKey(f.key);
        if (!slot) return null;
        const text = await bridge.saves.read(f.key);
        return text === null ? null : metaFromText(slot, text, f.bytes);
      }));
      return metas.filter((m): m is SlotMeta => m !== null);
    },
    read: (slot) => bridge.saves.read(slotKey(slot)),
    write: (meta, text) => bridge.saves.write(slotKey(meta.slot), text),
    remove: (slot) => bridge.saves.remove(slotKey(slot)),
  };
}

export function createDesktopPlatform(bridge: DesktopBridge): Platform {
  return {
    kind: "desktop",
    saves: createDesktopSaveStore(bridge),
    fullscreen: { get: () => bridge.window.isFullscreen(), set: (on) => bridge.window.setFullscreen(on) },
    canQuit: true,
    quit: () => bridge.window.quit(),
    unlockAchievement: (id) => bridge.steam.unlockAchievement(id),
  };
}
