// Where the game runs: a browser tab ("web") or the Electron desktop app. Everything environment-specific goes through here.
import type { SaveStore } from "../save/store";
import { getDesktopBridge } from "./desktopBridge";
import { createDesktopPlatform } from "./desktop";
import { createWebPlatform } from "./web";

export interface Platform {
  kind: "web" | "desktop";
  /** Save slots: IndexedDB in the browser, one file per slot on the desktop. */
  saves: SaveStore;
  fullscreen: { get(): Promise<boolean>; set(on: boolean): Promise<void> };
  /** Close the app. A no-op where `canQuit` is false (a browser tab). */
  canQuit: boolean;
  quit(): Promise<void>;
  /** Resolves true when a Steam achievement was unlocked; always false on the web. */
  unlockAchievement(id: string): Promise<boolean>;
}

let current: Platform | null = null;

export function getPlatform(): Platform {
  if (!current) {
    const bridge = getDesktopBridge();
    current = bridge ? createDesktopPlatform(bridge) : createWebPlatform();
  }
  return current;
}

/** Tests: inject a platform, or pass null to go back to detection. */
export function setPlatformForTests(p: Platform | null): void {
  current = p;
}
