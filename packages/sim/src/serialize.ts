// Save-file envelope for SimState. SimState is plain JSON (no Map/Set/undefined/NaN), so serialization is JSON.stringify
// with a versioned wrapper; `extras` carries opaque UI-side data (feed, ledger, pending decisions) that the app restores.
import type { SimState } from "./state";

export const SAVE_VERSION = 1;
export const SAVE_FORMAT = "air-route-game-save";

export interface SaveFile<X = unknown> {
  format: typeof SAVE_FORMAT;
  version: number;
  /** ISO timestamp. */
  savedAt: string;
  appVersion: string;
  seed: number;
  state: SimState;
  extras?: X;
}

export type ParseResult<X = unknown> =
  | { ok: true; save: SaveFile<X> }
  | { ok: false; code: "not_json" | "not_a_save" | "version_mismatch" | "corrupt"; message: string };

export function makeSave<X>(state: SimState, opts: { appVersion: string; savedAt?: string; extras?: X }): SaveFile<X> {
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: opts.savedAt ?? new Date().toISOString(), appVersion: opts.appVersion,
    seed: state.world.seed, state, ...(opts.extras !== undefined ? { extras: opts.extras } : {}),
  };
}

export function stringifySave(save: SaveFile): string {
  return JSON.stringify(save);
}

/** Validate and parse save text. Never throws; returns a friendly message on failure. */
export function parseSave<X = unknown>(text: string): ParseResult<X> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, code: "not_json", message: "This file is not a valid save (it could not be read as JSON)." }; }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== SAVE_FORMAT) {
    return { ok: false, code: "not_a_save", message: "This file is not an Air Route Game save." };
  }
  const f = raw as Partial<SaveFile<X>>;
  if (f.version !== SAVE_VERSION) {
    return {
      ok: false, code: "version_mismatch",
      message: `This save was made by a different version of the game (save format ${String(f.version)}, this build reads format ${SAVE_VERSION}). It cannot be loaded.`,
    };
  }
  const s = f.state as SimState | undefined;
  if (!s || typeof s !== "object" || !s.world || !Array.isArray(s.world.routes) || !Array.isArray(s.world.fleet) || typeof s.world.day !== "number" || !Array.isArray(s.airports) || !Array.isArray(s.aircraftTypes)) {
    return { ok: false, code: "corrupt", message: "This save file is damaged or incomplete." };
  }
  return { ok: true, save: f as SaveFile<X> };
}
