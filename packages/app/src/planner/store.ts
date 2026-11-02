import { create } from "zustand";
import type { Id } from "@arg/contracts";
import { useUi } from "../store";

export type ColorBy = "route" | "status";
export type SideTab = "issues" | "routes";

interface PlannerUi {
  horizon: 30 | 90 | 180 | 365;
  colorBy: ColorBy;
  collapsed: string[];
  aircraftId: Id | null;
  routeId: Id | null;
  tab: SideTab;
  showShort: boolean;
  /** Gap whose cover suggestions are open. */
  openGap: string | null;
  set: (p: Partial<Omit<PlannerUi, "set" | "toggleGroup" | "focus">>) => void;
  toggleGroup: (g: string) => void;
  /** Open the planner on an aircraft (and optionally one of its issues). */
  focus: (aircraftId: Id | null, gapId?: string | null) => void;
}

export const usePlanner = create<PlannerUi>((set) => ({
  horizon: 90, colorBy: "route", collapsed: [], aircraftId: null, routeId: null, tab: "issues", showShort: false, openGap: null,
  set: (p) => set(p),
  toggleGroup: (g) => set((s) => ({ collapsed: s.collapsed.includes(g) ? s.collapsed.filter((x) => x !== g) : [...s.collapsed, g] })),
  focus: (aircraftId, gapId = null) => {
    set({ aircraftId, openGap: gapId, tab: "issues", showShort: true });
    useUi.getState().setView("planner");
  },
}));
