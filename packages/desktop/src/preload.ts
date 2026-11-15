import { contextBridge, ipcRenderer } from "electron";
import { IPC, type DesktopBridge } from "./bridge";

// Sandboxed preloads cannot call app.getVersion(); the main process answers synchronously.
const version = ipcRenderer.sendSync(IPC.version) as string;

const bridge: DesktopBridge = {
  version,
  saves: {
    list: () => ipcRenderer.invoke(IPC.savesList),
    read: (key) => ipcRenderer.invoke(IPC.savesRead, key),
    write: (key, text) => ipcRenderer.invoke(IPC.savesWrite, key, text),
    remove: (key) => ipcRenderer.invoke(IPC.savesRemove, key),
  },
  window: {
    isFullscreen: () => ipcRenderer.invoke(IPC.isFullscreen),
    setFullscreen: (on) => ipcRenderer.invoke(IPC.setFullscreen, on),
    quit: () => ipcRenderer.invoke(IPC.quit),
  },
  steam: {
    available: () => ipcRenderer.invoke(IPC.steamAvailable),
    unlockAchievement: (id) => ipcRenderer.invoke(IPC.steamUnlock, id),
  },
};

contextBridge.exposeInMainWorld("argDesktop", bridge);
