import { create } from "zustand";
import type { CabinLayout } from "@arg/contracts";

/** Custom cabin designs the player has saved for new orders, per aircraft type id (per-session). */
interface CabinDrafts {
  orderLayouts: Record<string, CabinLayout>;
  setOrderLayout: (typeId: string, layout: CabinLayout | null) => void;
  /** Type the standalone designer is showing. */
  designerType: string;
  setDesignerType: (id: string) => void;
}

export const useCabinDrafts = create<CabinDrafts>((set) => ({
  orderLayouts: {},
  setOrderLayout: (typeId, layout) =>
    set((s) => {
      const { [typeId]: _old, ...rest } = s.orderLayouts;
      return { orderLayouts: layout ? { ...rest, [typeId]: layout } : rest };
    }),
  designerType: "",
  setDesignerType: (designerType) => set({ designerType }),
}));
