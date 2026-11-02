import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import land from "./land.json";
import type { MapColors } from "./colors";

/** Fully offline style: background + bundled GeoJSON land. No tiles, no glyphs, no sprites. */
export function buildStyle(c: MapColors): StyleSpecification {
  return {
    version: 8,
    sources: { land: { type: "geojson", data: land as never } },
    layers: [
      { id: "water", type: "background", paint: { "background-color": c.water } },
      { id: "land-context", type: "fill", source: "land", filter: ["==", ["get", "focus"], 0], paint: { "fill-color": c.land } },
      { id: "land-glow", type: "line", source: "land", filter: ["==", ["get", "focus"], 1],
        paint: { "line-color": c.coastGlow, "line-width": 7, "line-blur": 8, "line-opacity": 0.55 } },
      { id: "land-focus", type: "fill", source: "land", filter: ["==", ["get", "focus"], 1], paint: { "fill-color": c.landFocus } },
      { id: "land-border-context", type: "line", source: "land", filter: ["==", ["get", "focus"], 0],
        paint: { "line-color": c.landBorder, "line-width": 0.8, "line-opacity": 0.6, "line-dasharray": [3, 2] } },
      { id: "land-border", type: "line", source: "land", filter: ["==", ["get", "focus"], 1],
        paint: { "line-color": c.landBorder, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.4] } },
    ],
  };
}

export function applyStyleColors(map: MLMap, c: MapColors): void {
  if (!map.getLayer("water")) return;
  map.setPaintProperty("water", "background-color", c.water);
  map.setPaintProperty("land-context", "fill-color", c.land);
  map.setPaintProperty("land-glow", "line-color", c.coastGlow);
  map.setPaintProperty("land-focus", "fill-color", c.landFocus);
  map.setPaintProperty("land-border-context", "line-color", c.landBorder);
  map.setPaintProperty("land-border", "line-color", c.landBorder);
}
