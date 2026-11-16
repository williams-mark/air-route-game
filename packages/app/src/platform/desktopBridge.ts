// The API the Electron preload script exposes as window.argDesktop. A matching copy lives in packages/desktop/src/bridge.ts;
// keep the two in step. Absent in a browser.
export interface DesktopBridge {
  version: string;
  saves: {
    list(): Promise<{ key: string; bytes: number; modifiedMs: number }[]>;
    read(key: string): Promise<string | null>;
    write(key: string, text: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  window: {
    isFullscreen(): Promise<boolean>;
    setFullscreen(on: boolean): Promise<void>;
    quit(): Promise<void>;
  };
  steam: {
    available(): Promise<boolean>;
    unlockAchievement(id: string): Promise<boolean>;
  };
}

declare global {
  interface Window { argDesktop?: DesktopBridge }
}

export function getDesktopBridge(): DesktopBridge | null {
  return typeof window !== "undefined" ? window.argDesktop ?? null : null;
}
