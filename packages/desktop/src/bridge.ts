// The contract exposed to the renderer as `window.argDesktop`.
// packages/app/src/platform/desktopBridge.ts holds a matching copy; keep them in sync.
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

export const IPC = {
  version: "arg:version",
  savesList: "arg:saves:list",
  savesRead: "arg:saves:read",
  savesWrite: "arg:saves:write",
  savesRemove: "arg:saves:remove",
  isFullscreen: "arg:window:isFullscreen",
  setFullscreen: "arg:window:setFullscreen",
  quit: "arg:window:quit",
  steamAvailable: "arg:steam:available",
  steamUnlock: "arg:steam:unlock",
} as const;
