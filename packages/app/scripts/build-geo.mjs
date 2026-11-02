// Builds src/map/land.json (GeoJSON) from us-atlas. Run: node scripts/build-geo.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("us-atlas/states-10m.json"), "utf8"));
const fc = feature(topo, topo.objects.states);
const keep = { "06": "CA", "15": "HI", "32": "NV", "04": "AZ", "41": "OR", "49": "UT", "16": "ID" };
const round = (c) => (typeof c[0] === "number" ? [Math.round(c[0] * 1e3) / 1e3, Math.round(c[1] * 1e3) / 1e3] : c.map(round));
const features = fc.features.filter((f) => keep[f.id]).map((f) => ({
  type: "Feature",
  properties: { code: keep[f.id], focus: keep[f.id] === "CA" || keep[f.id] === "HI" ? 1 : 0 },
  geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
}));
writeFileSync(new URL("../src/map/land.json", import.meta.url), JSON.stringify({ type: "FeatureCollection", features }));
console.log(features.length, "features");
