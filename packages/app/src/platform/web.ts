import { IdbStore, MemoryStore } from "../save/store";
import type { Platform } from "./index";

/** The browser platform: IndexedDB saves (memory when unavailable, so saves are lost on reload) and the Fullscreen API. */
export function createWebPlatform(): Platform {
  const saves = typeof indexedDB !== "undefined" ? new IdbStore() : new MemoryStore();
  return {
    kind: "web",
    saves,
    fullscreen: {
      get: async () => typeof document !== "undefined" && document.fullscreenElement != null,
      set: async (on) => {
        if (typeof document === "undefined") return;
        if (on) await document.documentElement.requestFullscreen?.();
        else if (document.fullscreenElement) await document.exitFullscreen();
      },
    },
    canQuit: false,
    quit: async () => undefined,
    unlockAchievement: async () => false,
  };
}
