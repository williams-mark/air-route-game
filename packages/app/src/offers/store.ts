import { create } from "zustand";

export type OrdersTab = "orders" | "offers";

interface OffersUi {
  tab: OrdersTab;
  /** Offer ids the player has seen in the popup (decided later or opened). */
  seen: string[];
  setTab: (t: OrdersTab) => void;
  markSeen: (ids: string[]) => void;
}

export const useOffersUi = create<OffersUi>((set) => ({
  tab: "orders",
  seen: [],
  setTab: (tab) => set({ tab }),
  markSeen: (ids) => set((s) => ({ seen: [...new Set([...s.seen, ...ids])].slice(-200) })),
}));
