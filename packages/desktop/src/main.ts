import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { IPC } from "./bridge";
import { resolveInside } from "./paths";
import { listSaves, readSave, removeSave, writeSave } from "./saves";
import { initSteam, shutdownSteam, steamAvailable, unlockAchievement } from "./steam";

const SCHEME = "app";
const HOST = "game";
const ORIGIN = `${SCHEME}://${HOST}`;
const DEV_URL = process.env.ARG_DEV_URL;
const SMOKE = process.env.ARG_SMOKE === "1";
const smokeStatus = { steamworksMissing: false };
/** With ARG_SMOKE=1: skip the start screen and write a PNG of the window to this path. */
const SMOKE_SHOT = process.env.ARG_SMOKE_SHOT;

// Fixes the user-data folder (and so the saves folder) to %APPDATA%/Air Route Game in dev and packaged builds alike.
app.setName("Air Route Game");

// Steam must start before app "ready" (the overlay helper appends Chromium switches). Disabled unless an app id is configured.
const steamState = initSteam({
  env: process.env,
  packaged: app.isPackaged,
  appidDir: app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, ".."),
});

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** Directory holding the built web app: resources/game when packaged, ../app/dist in the repo. */
function gameRoot(): string {
  return app.isPackaged ? path.join(process.resourcesPath, "game") : path.resolve(__dirname, "../../app/dist");
}

function registerGameProtocol(): void {
  const root = gameRoot();
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response("Not found", { status: 404 });
    const file = resolveInside(root, url.pathname);
    if (!file) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString()).catch(() => new Response("Not found", { status: 404 }));
  });
}

function isInternal(url: string): boolean {
  if (DEV_URL && url.startsWith(new URL(DEV_URL).origin)) return true;
  return url.startsWith(ORIGIN + "/");
}

function externalOpen(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0b0f14",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;
  if (app.isPackaged || SMOKE) win.removeMenu();
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    externalOpen(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isInternal(url)) {
      e.preventDefault();
      externalOpen(url);
    }
  });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  if (SMOKE) attachSmoke(win);

  void win.loadURL(DEV_URL ?? `${ORIGIN}/index.html${SMOKE && SMOKE_SHOT ? "?nostart" : ""}`);
}

/** ARG_SMOKE=1: load, wait ~5s, print title and console errors, exit 0 (clean) or 1. */
function attachSmoke(win: BrowserWindow): void {
  const errors: string[] = [];
  let failed = false;
  win.webContents.on("console-message", (_e, level, message, line, source) => {
    if (level >= 3) errors.push(`${message} (${source}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    failed = true;
    console.log(`[smoke] did-fail-load ${code} ${desc} ${url}`);
  });
  win.webContents.on("render-process-gone", (_e, d) => {
    failed = true;
    console.log(`[smoke] render-process-gone ${d.reason}`);
  });
  win.webContents.on("did-finish-load", () => {
    console.log("[smoke] did-finish-load");
    setTimeout(async () => {
      try {
        const info = await win.webContents.executeJavaScript(
          `({ title: document.title, rootChildren: document.getElementById("root") ? document.getElementById("root").childElementCount : -1, bridge: typeof window.argDesktop, version: window.argDesktop && window.argDesktop.version, origin: location.origin })`,
        );
        console.log(`[smoke] page ${JSON.stringify(info)}`);
        const saved = await win.webContents.executeJavaScript(
          `(async () => { const b = window.argDesktop; await b.saves.write("smoke-test", "{}"); const r = await b.saves.read("smoke-test"); await b.saves.remove("smoke-test"); return r; })()`,
        );
        console.log(`[smoke] saves roundtrip ${saved}`);
        const gl = await win.webContents.executeJavaScript(
          `(() => { const g = document.createElement("canvas").getContext("webgl2"); if (!g) return "none"; const x = g.getExtension("WEBGL_debug_renderer_info"); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : "webgl2"; })()`,
        );
        console.log(`[smoke] webgl ${gl}`);
        if (gl === "none") errors.push("WebGL2 is not available");
        if (SMOKE_SHOT) writeFileSync(SMOKE_SHOT, (await win.webContents.capturePage()).toPNG());
      } catch (e) {
        errors.push(`smoke script failed: ${String(e)}`);
      }
      for (const err of errors) console.log(`[smoke] console error: ${err}`);
      if (smokeStatus.steamworksMissing) errors.push("steamworks.js module missing");
      const ok = !failed && errors.length === 0;
      console.log(`[smoke] ${ok ? "OK" : "FAILED"}`);
      app.exit(ok ? 0 : 1);
    }, 5000);
  });
}

function registerIpc(): void {
  const savesDir = () => path.join(app.getPath("userData"), "saves");
  ipcMain.on(IPC.version, (e) => {
    e.returnValue = app.getVersion();
  });
  ipcMain.handle(IPC.savesList, () => listSaves(savesDir()));
  ipcMain.handle(IPC.savesRead, (_e, key: string) => readSave(savesDir(), key));
  ipcMain.handle(IPC.savesWrite, (_e, key: string, text: string) => writeSave(savesDir(), key, text));
  ipcMain.handle(IPC.savesRemove, (_e, key: string) => removeSave(savesDir(), key));
  ipcMain.handle(IPC.isFullscreen, () => mainWindow?.isFullScreen() ?? false);
  ipcMain.handle(IPC.setFullscreen, (_e, on: boolean) => {
    mainWindow?.setFullScreen(Boolean(on));
  });
  ipcMain.handle(IPC.quit, () => {
    app.quit();
  });
  ipcMain.handle(IPC.steamAvailable, () => steamAvailable());
  ipcMain.handle(IPC.steamUnlock, (_e, id: string) => unlockAchievement(String(id)));
}

/** ARG_SMOKE=1: prove the native module is shipped (resolvable, binary present) without initialising Steam. */
function checkSteamworksModule(): boolean {
  let found = false;
  try {
    const entry = require.resolve("steamworks.js");
    const bin = path.join(path.dirname(entry), "dist", "win64", "steamworksjs.win32-x64-msvc.node");
    // Inside app.asar the binaries live in app.asar.unpacked; require() redirects, existsSync does too.
    found = existsSync(entry) && (process.platform !== "win32" || existsSync(bin.replace("app.asar", "app.asar.unpacked")));
  } catch {
    found = false;
  }
  console.log(`[smoke] steamworks module: ${found ? "found" : "missing"}`);
  return found;
}

if (steamState === "restarting") {
  app.quit();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  void app.whenReady().then(() => {
    if (!DEV_URL && !existsSync(path.join(gameRoot(), "index.html"))) {
      console.error(`Game build not found at ${gameRoot()}. Run: pnpm --filter @arg/app build`);
    }
    registerGameProtocol();
    registerIpc();
    createWindow();
    if (SMOKE && !checkSteamworksModule()) smokeStatus.steamworksMissing = true;
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => shutdownSteam());
}
