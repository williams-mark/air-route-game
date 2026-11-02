import { create } from "zustand";
import type { CameraPresetId, Theme } from "./map/types";

export type Selection = { kind: "route" | "airport"; id: string } | null;

interface UiState {
  theme: Theme;
  paused: boolean;
  selection: Selection;
  preset: CameraPresetId;
  presetNonce: number;
  setTheme: (t: Theme) => void;
  togglePaused: () => void;
  select: (s: Selection) => void;
  flyTo: (p: CameraPresetId) => void;
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t; // synchronous so map code can read CSS variables right away
}

const initial: Theme = (() => {
  try {
    const q = new URLSearchParams(location.search).get("theme");
    if (q === "light" || q === "dark") return q;
    const s = localStorage.getItem("arg-theme");
    if (s === "light" || s === "dark") return s;
  } catch { /* ignore */ }
  return "dark";
})();
applyTheme(initial);

export const useUi = create<UiState>((set) => ({
  theme: initial,
  paused: false,
  selection: null,
  preset: "both",
  presetNonce: 0,
  setTheme: (t) => {
    applyTheme(t);
    try { localStorage.setItem("arg-theme", t); } catch { /* ignore */ }
    set({ theme: t });
  },
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  select: (selection) => set({ selection }),
  flyTo: (preset) => set((s) => ({ preset, presetNonce: s.presetNonce + 1 })),
}));
