import type { Airport } from "@arg/contracts";
import { displayLon } from "./geo";
import { regionGroupOf } from "@arg/sim";
import { continentOf } from "../routes/geoNames";
import type { CameraPresetId } from "./types";

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

export const CAMERA_PRESETS: readonly CameraPresetId[] = ["west", "us", "europe", "alaska", "hawaii", "canadaMexico", "southAmerica", "africa", "middleEast", "asia", "oceania", "world"];

const FIXED: Record<Exclude<CameraPresetId, "world">, Bounds> = {
  west: [-125.0, 32.3, -114.0, 49.2],
  us: [-125.5, 24.3, -66.5, 49.6],
  europe: [-12.5, 35.5, 32.0, 62.0],
  alaska: [-168.0, 54.0, -130.0, 71.5],
  hawaii: [-160.6, 18.7, -154.6, 22.4],
  // Also frames Central America and the Caribbean (Puerto Rico, Panama); Iqaluit is the northernmost airport.
  canadaMexico: [-142, 6, -52, 64],
  southAmerica: [-83, -56, -33, 13],
  africa: [-20, -35.5, 52, 38],
  // Gulf, Turkey, Caucasus and Central Asia; India's west coast is just inside.
  middleEast: [25, 10, 80, 46],
  // India to Japan, Mongolia down to Indonesia and the Philippines.
  asia: [66, -11, 146, 54],
  // Australia, New Zealand and the nearer Pacific (Fiji, New Caledonia, Guam).
  oceania: [110, -48, 180, 20],
};
export const PRESET_LABEL: Record<CameraPresetId, string> = {
  west: "West Coast", us: "United States", europe: "Europe", alaska: "Alaska", hawaii: "Hawaii", canadaMexico: "Canada / Mexico", southAmerica: "South America", africa: "Africa", middleEast: "Middle East", asia: "Asia",
  oceania: "Oceania", world: "World",
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

/** The camera preset that frames a home airport: a US preset (Hawaii, Alaska, West Coast, rest of the US), else the preset of its continent or region group. */
export function presetForAirport(a: Pick<Airport, "country" | "region">): CameraPresetId {
  if (a.country !== "US") {
    switch (continentOf(a.country)) {
      case "North America": return "canadaMexico";
      case "South America": return "southAmerica";
      case "Africa": return "africa";
      case "Oceania": return "oceania";
      case "Asia": return regionGroupOf(a.country) === "middleEast" ? "middleEast" : "asia";
      default: return "europe";
    }
  }
  if (a.region === "HI") return "hawaii";
  if (a.region === "AK") return "alaska";
  return a.region === "CA" || a.region === "OR" || a.region === "WA" ? "west" : "us";
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
