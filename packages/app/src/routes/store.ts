import { create } from "zustand";
import type { Speed } from "../sim/bridge";
import { bridge, setSpeed } from "../sim/useSim";
import { useUi } from "../store";

// --- Toasts ----------------------------------------------------------------
export interface Toast { id: number; kind: "good" | "alert" | "info"; text: string }
interface ToastState { toasts: Toast[]; push: (kind: Toast["kind"], text: string) => void; dismiss: (id: number) => void }
let nextToast = 1;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, text) => {
    const id = nextToast++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => get().dismiss(id), kind === "alert" ? 9000 : 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// --- Aircraft swap requests (Routes table row action, command palette) -------
interface SwapRequest { routeId: string | null; nonce: number; request: (routeId: string) => void; clear: () => void }
/** Asks the route inspector for `routeId` to open its "Change aircraft type" box. */
export const useSwapRequest = create<SwapRequest>((set) => ({
  routeId: null, nonce: 0,
  request: (routeId) => { useUi.getState().select({ kind: "route", id: routeId }); set((s) => ({ routeId, nonce: s.nonce + 1 })); },
  clear: () => set({ routeId: null }),
}));

// --- Route creation sandbox ------------------------------------------------
export type PickTarget = "origin" | "destination";
interface CreationState {
  open: boolean;
  origin: string | null;
  destination: string | null;
  pick: PickTarget;
  /** Speed to restore when the sandbox closes (0 if the game was already paused). */
  prevSpeed: Speed;
  begin: (origin?: string) => void;
  end: (restore?: boolean) => void;
  setPick: (p: PickTarget) => void;
  /** Assign an airport (from the map or a field) to the given end, or to the active pick target. */
  assign: (id: string, which?: PickTarget) => void;
  clear: (which: PickTarget) => void;
  swap: () => void;
}

export const useCreation = create<CreationState>((set, get) => ({
  open: false, origin: null, destination: null, pick: "origin", prevSpeed: 0,
  begin: (origin) => {
    if (get().open) { if (origin) get().assign(origin, "origin"); return; }
    const prev = bridge.getState().speed;
    setSpeed(0);
    const ui = useUi.getState();
    ui.select(null);
    if (ui.view !== "map") ui.setView("map");
    set({ open: true, origin: origin ?? null, destination: null, pick: origin ? "destination" : "origin", prevSpeed: prev });
  },
  end: (restore = true) => {
    const { open, prevSpeed } = get();
    if (!open) return;
    set({ open: false, origin: null, destination: null, pick: "origin" });
    if (restore && prevSpeed > 0 && bridge.getState().speed === 0) setSpeed(prevSpeed);
  },
  setPick: (pick) => set({ pick }),
  assign: (id, which) => set((s) => {
    const w = which ?? s.pick;
    const other = w === "origin" ? s.destination : s.origin;
    const next = other === id ? null : other; // picking the same airport on both ends clears the other end
    const origin = w === "origin" ? id : next;
    const destination = w === "destination" ? id : next;
    const pick: PickTarget = w === "origin" ? (destination ? "origin" : "destination") : (origin ? "destination" : "origin");
    return { origin, destination, pick };
  }),
  clear: (which) => set(which === "origin" ? { origin: null, pick: "origin" } : { destination: null, pick: "destination" }),
  swap: () => set((s) => ({ origin: s.destination, destination: s.origin })),
}));
