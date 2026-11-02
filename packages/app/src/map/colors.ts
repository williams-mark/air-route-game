import type { Rgba } from "./types";

export interface MapColors {
  water: string; land: string; landFocus: string; landBorder: string; coastGlow: string;
  profit: Rgba; marginal: Rgba; loss: Rgba; planned: Rgba; casing: Rgba; select: Rgba;
  airportFill: Rgba; airportStroke: Rgba; airportHub: Rgba; aircraft: Rgba; label: Rgba; labelHalo: Rgba;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function rgba(name: string, a = 255): Rgba {
  const h = css(name).replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), a];
}

/** Reads the current theme's map colours from CSS variables (call after data-theme changed). */
export function readMapColors(): MapColors {
  return {
    water: css("--map-water"), land: css("--map-land"), landFocus: css("--map-land-focus"),
    landBorder: css("--map-land-border"), coastGlow: css("--map-coast-glow"),
    profit: rgba("--route-profit"), marginal: rgba("--route-marginal"), loss: rgba("--route-loss"),
    planned: rgba("--route-planned"), casing: rgba("--route-casing", 150), select: rgba("--route-select"),
    airportFill: rgba("--airport-fill"), airportStroke: rgba("--airport-stroke"), airportHub: rgba("--airport-hub"),
    aircraft: rgba("--aircraft"), label: rgba("--map-label"), labelHalo: rgba("--map-label-halo"),
  };
}
