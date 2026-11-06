import { create } from "zustand";
import type { CameraPresetId, Theme } from "./map/types";
import { startScreenWanted } from "./save/saves";

export type Selection = { kind: "route" | "airport"; id: string } | null;
export type ViewId = "map" | "routes" | "fleet" | "planner" | "orders" | "cabin" | "finance" | "rivals" | "settings";
export const UI_SCALES = [90, 100, 110, 125] as const;

interface UiState {
  theme: Theme;
  view: ViewId;
  selection: Selection;
  preset: CameraPresetId;
  presetNonce: number;
  uiScale: number;
  paletteOpen: boolean;
  /** Save/load dialog (null = closed). */
  saveDialog: "save" | "load" | null;
  startOpen: boolean;
  showCompetitors: boolean;
  selectedRival: string | null;
  helpOpen: boolean;
  feedOpen: boolean;
  /** Decision ids the player chose to decide later (hidden until reopened). */
  snoozed: string[];
  /** Fleet view sort (per session). */
  setTheme: (t: Theme) => void;
  setView: (v: ViewId) => void;
  select: (s: Selection) => void;
  flyTo: (p: CameraPresetId) => void;
  setUiScale: (v: number) => void;
  setPalette: (v: boolean) => void;
  setSaveDialog: (v: "save" | "load" | null) => void;
  setStartOpen: (v: boolean) => void;
  setShowCompetitors: (v: boolean) => void;
  selectRival: (id: string | null) => void;
  setHelp: (v: boolean) => void;
  setFeedOpen: (v: boolean) => void;
  snooze: (id: string) => void;
  unsnoozeAll: () => void;
}

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t; // synchronous so map code can read CSS variables right away
}
function applyScale(pct: number) {
  document.documentElement.style.fontSize = `${(16 * pct) / 100}px`;
}

const initial: Theme = (() => {
  try {
    const q = new URLSearchParams(location.search).get("theme");
    if (q === "light" || q === "dark") return q;
  } catch { /* ignore */ }
  const s = read("arg-theme");
  return s === "light" || s === "dark" ? s : "dark";
})();
const initialScale = (() => {
  const n = Number(read("arg-scale"));
  return (UI_SCALES as readonly number[]).includes(n) ? n : 100;
})();
applyTheme(initial);
applyScale(initialScale);
document.documentElement.dataset.view = "map";

export const useUi = create<UiState>((set) => ({
  theme: initial,
  view: "map",
  selection: null,
  preset: "world",
  presetNonce: 0,
  uiScale: initialScale,
  paletteOpen: false,
  saveDialog: null,
  startOpen: (() => { try { return startScreenWanted(location.search); } catch { return false; } })(),
  showCompetitors: read("arg-competitors") === "1",
  selectedRival: null,
  helpOpen: false,
  feedOpen: true,
  snoozed: [],
  setTheme: (t) => { applyTheme(t); write("arg-theme", t); set({ theme: t }); },
  setView: (view) => { document.documentElement.dataset.view = view; set({ view }); },
  select: (selection) => set({ selection }),
  flyTo: (preset) => set((s) => ({ preset, presetNonce: s.presetNonce + 1 })),
  setUiScale: (uiScale) => { applyScale(uiScale); write("arg-scale", String(uiScale)); set({ uiScale }); },
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setSaveDialog: (saveDialog) => set({ saveDialog }),
  setStartOpen: (startOpen) => set({ startOpen }),
  setShowCompetitors: (showCompetitors) => { write("arg-competitors", showCompetitors ? "1" : "0"); set({ showCompetitors }); },
  selectRival: (selectedRival) => set({ selectedRival }),
  setHelp: (helpOpen) => set({ helpOpen }),
  setFeedOpen: (feedOpen) => set({ feedOpen }),
  snooze: (id) => set((s) => (s.snoozed.includes(id) ? s : { snoozed: [...s.snoozed, id] })),
  unsnoozeAll: () => set({ snoozed: [] }),
}));
