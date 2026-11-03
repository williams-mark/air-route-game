import type { Airport } from "@arg/contracts";
import { displayLon } from "./geo";
import type { CameraPresetId } from "./types";

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

export const CAMERA_PRESETS: readonly CameraPresetId[] = ["west", "us", "europe", "alaska", "hawaii", "world"];

const FIXED: Record<Exclude<CameraPresetId, "world">, Bounds> = {
  west: [-125.0, 32.3, -114.0, 49.2],
  us: [-125.5, 24.3, -66.5, 49.6],
  europe: [-12.5, 35.5, 32.0, 62.0],
  alaska: [-168.0, 54.0, -130.0, 71.5],
  hawaii: [-160.6, 18.7, -154.6, 22.4],
};
export const PRESET_LABEL: Record<CameraPresetId, string> = {
  west: "West Coast", us: "United States", europe: "Europe", alaska: "Alaska", hawaii: "Hawaii", world: "World",
};
const WORLD_FALLBACK: Bounds = [-165, 18, 40, 70];

/** World = fit every airport (display longitudes), with a little air around the edge. */
export function worldBounds(airports: readonly Pick<Airport, "lon" | "lat">[]): Bounds {
  if (!airports.length) return WORLD_FALLBACK;
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9;
  for (const a of airports) {
    const lon = displayLon(a.lon, a.lat);
    if (lon < w) w = lon; if (lon > e) e = lon; if (a.lat < s) s = a.lat; if (a.lat > n) n = a.lat;
  }
  const px = Math.max(1.5, (e - w) * 0.02), py = Math.max(1.5, (n - s) * 0.03);
  return [Math.max(-179.9, w - px), Math.max(-80, s - py), Math.min(179.9, e + px), Math.min(84, n + py)];
}

export function boundsFor(preset: CameraPresetId, airports: readonly Pick<Airport, "lon" | "lat">[]): Bounds {
  return preset === "world" ? worldBounds(airports) : FIXED[preset];
}

export interface SavedCamera { center: [number, number]; zoom: number }
const CAMERA_KEY = "arg-camera";

export function parseCamera(raw: string | null): SavedCamera | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<SavedCamera>;
    const [lon, lat] = c.center ?? [];
    if (typeof lon !== "number" || typeof lat !== "number" || typeof c.zoom !== "number") return null;
    if (![lon, lat, c.zoom].every(Number.isFinite) || Math.abs(lat) > 85 || lon < -200 || lon > 200 || c.zoom < 1 || c.zoom > 14) return null;
    return { center: [lon, lat], zoom: c.zoom };
  } catch { return null; }
}
export const loadCamera = (): SavedCamera | null => { try { return parseCamera(localStorage.getItem(CAMERA_KEY)); } catch { return null; } };
export const saveCamera = (c: SavedCamera): void => { try { localStorage.setItem(CAMERA_KEY, JSON.stringify({ center: [+c.center[0].toFixed(4), +c.center[1].toFixed(4)], zoom: +c.zoom.toFixed(3) })); } catch { /* ignore */ } };
