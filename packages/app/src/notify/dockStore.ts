import { create } from "zustand";
import { parseSaved, type Corner, type Pt } from "./dockLogic";

const KEY = "arg-dock";
const initial = (() => { try { return parseSaved(localStorage.getItem(KEY)); } catch { return parseSaved(null); } })();

interface DockState {
  minimized: boolean;
  corner: Corner;
  /** Dragged position (viewport px, top-left). null = anchored to `corner`. */
  pos: Pt | null;
  /** Notices with an id at or below this are hidden ("Clear notices"). */
  clearedUpTo: number;
  /** On non-map views the dock stays a pill until the player opens it; reset when the view changes. */
  peek: boolean;
  setMinimized: (v: boolean) => void;
  toggle: () => void;
  setCorner: (c: Corner) => void;
  setPos: (p: Pt | null) => void;
  resetPosition: () => void;
  clearNotices: (upTo: number) => void;
  setPeek: (v: boolean) => void;
}

function persist(s: Pick<DockState, "minimized" | "corner" | "pos">) {
  try { localStorage.setItem(KEY, JSON.stringify({ minimized: s.minimized, corner: s.corner, pos: s.pos })); } catch { /* ignore */ }
}

export const useDock = create<DockState>((set, get) => ({
  ...initial,
  clearedUpTo: 0,
  peek: false,
  setMinimized: (minimized) => { set({ minimized, peek: !minimized }); persist(get()); },
  toggle: () => get().setMinimized(!get().minimized),
  setCorner: (corner) => { set({ corner, pos: null }); persist(get()); },
  setPos: (pos) => { set({ pos }); persist(get()); },
  resetPosition: () => { set({ pos: null, corner: "bottom-left" }); persist(get()); },
  clearNotices: (clearedUpTo) => set({ clearedUpTo }),
  setPeek: (peek) => set({ peek }),
}));
