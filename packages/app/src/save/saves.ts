// Save/load/export/import logic on top of a SaveStore. Pure apart from the store and the bridge it is given.
import { dayToDate, parseSave, stringifySave, type SaveFile } from "@arg/sim";
import type { SimBridge } from "../sim/bridge";
import { getStore, type SaveStore, type SlotId, type SlotMeta } from "./store";

export type Outcome = { ok: true; message: string } | { ok: false; message: string };

export function metaOf(slot: SlotId, save: SaveFile, bytes: number): SlotMeta {
  const w = save.state.world;
  return { slot, savedAt: save.savedAt, day: w.day, cash: w.cash, airline: save.state.airlineName, seed: save.seed, appVersion: save.appVersion, bytes };
}

export const slotName = (s: SlotId) => (s === "auto" ? "Autosave" : `Slot ${s}`);

/** Calendar month number since day 0. */
export function monthIndex(day: number): number {
  const d = dayToDate(day);
  return (d.year - 2015) * 12 + d.month;
}

/** Autosave on the first day of each in-game month during continuous play (not after a load or jump). */
export function autosaveDue(prevDay: number, day: number): boolean {
  return day > prevDay && day - prevDay <= 40 && monthIndex(day) !== monthIndex(prevDay);
}

export async function saveToSlot(bridge: SimBridge, slot: SlotId, store: SaveStore = getStore()): Promise<Outcome> {
  if (!bridge.serialize) return { ok: false, message: "This game mode cannot be saved." };
  try {
    const save = bridge.serialize();
    const text = stringifySave(save);
    await store.write(metaOf(slot, save, text.length), text);
    return { ok: true, message: `Saved to ${slotName(slot)}.` };
  } catch (e) {
    return { ok: false, message: `Could not save: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function loadText(bridge: SimBridge, text: string): Outcome {
  if (!bridge.loadGame) return { ok: false, message: "This game mode cannot load saves." };
  const r = parseSave(text);
  if (!r.ok) return { ok: false, message: r.message };
  try { bridge.loadGame(r.save); } catch (e) { return { ok: false, message: `The save could not be loaded: ${e instanceof Error ? e.message : String(e)}` }; }
  return { ok: true, message: "Game loaded." };
}

export async function loadFromSlot(bridge: SimBridge, slot: SlotId, store: SaveStore = getStore()): Promise<Outcome> {
  try {
    const text = await store.read(slot);
    if (text === null) return { ok: false, message: `${slotName(slot)} is empty.` };
    return loadText(bridge, text);
  } catch (e) {
    return { ok: false, message: `Could not read the save: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function latestSlot(metas: SlotMeta[]): SlotMeta | null {
  return metas.reduce<SlotMeta | null>((best, m) => (!best || m.savedAt > best.savedAt ? m : best), null);
}

export function exportFileName(save: SaveFile): string {
  return `air-route-game-${save.state.airlineName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-day${save.state.world.day}.json`;
}

/** Offer the current game as a .json download. */
export function exportToFile(bridge: SimBridge): Outcome {
  if (!bridge.serialize) return { ok: false, message: "This game mode cannot be saved." };
  const save = bridge.serialize();
  const url = URL.createObjectURL(new Blob([stringifySave(save)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = exportFileName(save);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true, message: `Exported ${a.download}.` };
}

export async function importFromFile(bridge: SimBridge, file: File): Promise<Outcome> {
  return loadText(bridge, await file.text());
}

/** Autosave when the in-game month changes and when the tab is hidden. Returns an uninstall function. */
export function installAutosave(bridge: SimBridge, opts: { blocked: () => boolean; store?: SaveStore; onError?: (m: string) => void }): () => void {
  let prev = bridge.getState().day;
  const run = () => {
    if (opts.blocked()) return;
    void saveToSlot(bridge, "auto", opts.store).then((o) => { if (!o.ok) opts.onError?.(o.message); });
  };
  const unsub = bridge.subscribe(() => {
    const day = bridge.getState().day;
    const due = autosaveDue(prev, day);
    prev = day;
    if (due) run();
  });
  const vis = () => { if (document.visibilityState === "hidden") run(); };
  // A reload or tab close does not always report "hidden" first; pagehide covers it (best effort: the write is asynchronous).
  document.addEventListener("visibilitychange", vis);
  window.addEventListener("pagehide", run);
  return () => { unsub(); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", run); };
}

/** Startup mode from the query string: the start screen is skipped by any of these. */
export function startScreenWanted(search: string): boolean {
  const q = new URLSearchParams(search);
  return !["newgame", "seed", "nostart", "ff", "mock", "paused"].some((k) => q.has(k));
}

export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  return Number(t);
}
