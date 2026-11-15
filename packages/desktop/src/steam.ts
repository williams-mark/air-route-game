// Steamworks integration (steamworks.js). Steam is OFF unless an app id is configured explicitly:
//   1. env ARG_STEAM_APP_ID
//   2. steam_appid.txt next to the executable (packaged) or in packages/desktop (dev, gitignored)
// There is deliberately no default id (not even Valve's test id 480): initialising with someone else's
// id while Steam runs would show the owner as playing another game. With no id the native module is never loaded.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The slice of the steamworks.js client that we use (see client.d.ts: `achievement` namespace). */
export interface SteamClient {
  achievement: {
    activate(achievement: string): boolean;
    isActivated(achievement: string): boolean;
  };
}

/** The slice of the steamworks.js module that we use (see index.d.ts). */
export interface SteamModule {
  init(appId?: number): SteamClient;
  restartAppIfNecessary(appId: number): boolean;
  electronEnableSteamOverlay(disableEachFrameInvalidation?: boolean): void;
}

export interface SteamEnv {
  env: Record<string, string | undefined>;
  /** app.isPackaged */
  packaged: boolean;
  /** Folder holding the executable (packaged) or packages/desktop (dev), where steam_appid.txt is looked for. */
  appidDir: string;
  /** Loads the native module; defaults to require("steamworks.js"). Injected in tests. */
  loadModule?: () => SteamModule;
  readFile?: (file: string) => string | null;
  log?: (line: string) => void;
}

export type AppIdResult = { appId: number; source: string } | { appId: null; reason: string };

const APP_ID_RE = /^[0-9]{1,10}$/;
const ACHIEVEMENT_RE = /^[A-Z0-9_]{1,64}$/;

function defaultRead(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function parseId(text: string): number | null {
  const t = text.trim();
  if (!APP_ID_RE.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Env var first, then steam_appid.txt. Returns a reason when there is no usable id. */
export function resolveAppId(
  env: Record<string, string | undefined>,
  appidDir: string,
  readFile: (file: string) => string | null = defaultRead,
): AppIdResult {
  const fromEnv = env.ARG_STEAM_APP_ID;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    const id = parseId(fromEnv);
    return id ? { appId: id, source: "ARG_STEAM_APP_ID" } : { appId: null, reason: "ARG_STEAM_APP_ID is not a positive integer" };
  }
  const file = path.join(appidDir, "steam_appid.txt");
  let text: string | null = null;
  try {
    text = readFile(file);
  } catch {
    return { appId: null, reason: `could not read ${file}` };
  }
  if (text === null) return { appId: null, reason: "no app id configured" };
  const id = parseId(text);
  return id ? { appId: id, source: file } : { appId: null, reason: `${file} does not hold a positive integer` };
}

export function isValidAchievementId(id: unknown): id is string {
  return typeof id === "string" && ACHIEVEMENT_RE.test(id);
}

export class SteamService {
  private client: SteamClient | null = null;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: SteamEnv) {
    this.log = opts.log ?? ((l) => console.log(l));
  }

  /**
   * Resolve the app id and initialise Steam. Never throws. Returns "restarting" when Steam is relaunching
   * the game through itself and the caller must quit. Call this BEFORE app "ready": the overlay helper
   * appends Chromium command-line switches, which are ignored after startup.
   */
  init(): "ready" | "disabled" | "restarting" {
    const { env, packaged, appidDir } = this.opts;
    const id = resolveAppId(env, appidDir, this.opts.readFile);
    if (id.appId === null) {
      this.log(`[steam] disabled: ${id.reason}`);
      return "disabled";
    }
    try {
      const mod = (this.opts.loadModule ?? (() => require("steamworks.js") as SteamModule))();
      // Packaged with a real id but started outside Steam: have Steam relaunch us (SteamAPI_RestartAppIfNecessary).
      if (packaged && mod.restartAppIfNecessary(id.appId)) {
        this.log("[steam] not started through Steam; relaunching via Steam");
        return "restarting";
      }
      this.client = mod.init(id.appId);
      // Sets the Chromium switches the Steam overlay needs (in-process-gpu, disable-direct-composition)
      // and keeps windows repainting so the overlay can draw over them.
      mod.electronEnableSteamOverlay();
      this.log(`[steam] initialised (app id from ${id.source})`);
      return "ready";
    } catch (e) {
      this.client = null;
      this.log(`[steam] disabled: init failed: ${e instanceof Error ? e.message : String(e)}`);
      return "disabled";
    }
  }

  available(): boolean {
    return this.client !== null;
  }

  /** True when the achievement is now (or already was) unlocked; false when Steam is off, the id is invalid or Steam errors. */
  unlockAchievement(id: string): boolean {
    if (!this.client || !isValidAchievementId(id)) return false;
    try {
      if (this.client.achievement.isActivated(id)) return true;
      return this.client.achievement.activate(id) === true;
    } catch {
      return false;
    }
  }

  /** steamworks.js has no client shutdown call; the process exit releases Steam. Drops our reference only. */
  shutdown(): void {
    this.client = null;
  }
}

let service: SteamService | null = null;

/** Create the process-wide service and init it. `mainEnv` supplies app.isPackaged and the exe folder. */
export function initSteam(opts: SteamEnv): "ready" | "disabled" | "restarting" {
  service = new SteamService(opts);
  return service.init();
}

export async function steamAvailable(): Promise<boolean> {
  return service?.available() ?? false;
}

export async function unlockAchievement(id: string): Promise<boolean> {
  return service?.unlockAchievement(id) ?? false;
}

export function shutdownSteam(): void {
  service?.shutdown();
}
