// Builds src/map/land.json (GeoJSON) for the offline map: all US states (us-atlas) + Europe focus and world context (world-atlas 50m).
// Run: node scripts/build-geo.mjs
// Properties: { code, focus }. focus 1 = playable land (US states, European countries), 0 = muted context.
// Simplification is per arc (topojson-simplify weights): focus arcs keep more detail than context arcs.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
import { presimplify } from "topojson-simplify";
const require = createRequire(import.meta.url);
const load = (p) => JSON.parse(readFileSync(require.resolve(p), "utf8"));

const US_FIPS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID",
  "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO",
  "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA",
  "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "72": "PR", "78": "VI",
};
// world-atlas 50m names that count as "Europe" (playable). Neighbours such as Morocco, Turkey, Russia and Ukraine stay muted context.
const EUROPE = new Map(Object.entries({
  Albania: "AL", Andorra: "AD", Austria: "AT", Belgium: "BE", "Bosnia and Herz.": "BA", Bulgaria: "BG", Croatia: "HR", Cyprus: "CY", Czechia: "CZ", Denmark: "DK",
  Estonia: "EE", "Faeroe Is.": "FO", Finland: "FI", France: "FR", Germany: "DE", Greece: "GR", Hungary: "HU", Iceland: "IS", Ireland: "IE", Italy: "IT",
  Kosovo: "XK", Latvia: "LV", Liechtenstein: "LI", Lithuania: "LT", Luxembourg: "LU", Malta: "MT", Monaco: "MC", Montenegro: "ME", Netherlands: "NL",
  Macedonia: "MK", Norway: "NO", Poland: "PL", Portugal: "PT", Romania: "RO", "San Marino": "SM", Serbia: "RS", Slovakia: "SK", Slovenia: "SI", Spain: "ES",
  Sweden: "SE", Switzerland: "CH", "United Kingdom": "GB", Jersey: "JE", Guernsey: "GG", "Isle of Man": "IM", "Åland": "AX", Vatican: "VA", "N. Cyprus": "CY",
}));
const SKIP = new Set(["Antarctica", "Fr. S. Antarctic Lands", "United States of America", "Puerto Rico", "U.S. Virgin Is."]);

const T_FOCUS = 1.2e-4, T_US = 1.5e-4, T_CTX = 2.5e-3; // triangle area, deg^2
const MIN_AREA = { focus: 4e-4, ctx: 6e-2 }; // drop polygons below this bbox area (deg^2)

/** Arcs referenced by the given geometries. */
function arcsOf(geoms) {
  const used = new Set();
  const walk = (a) => { if (typeof a === "number") used.add(a < 0 ? ~a : a); else a.forEach(walk); };
  geoms.forEach((g) => walk(g.arcs));
  return used;
}
/** presimplify, then thin every arc with the threshold of the strongest claim on it. */
function thin(topo, objName, isFocus, tFocus, tCtx) {
  const pre = presimplify(topo);
  const geoms = topo.objects[objName].geometries;
  const focusArcs = arcsOf(geoms.filter(isFocus));
  const arcs = pre.arcs.map((arc, i) => {
    const t = focusArcs.has(i) ? tFocus : tCtx;
    return arc.filter((p) => p[2] >= t).map((p) => [p[0], p[1]]);
  });
  return { ...pre, arcs };
}
const bboxArea = (ring) => {
  let w = 1e9, e = -1e9, s = 1e9, n = -1e9;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return (e - w) * (n - s);
};
const roundRing = (ring, d) => {
  const k = 10 ** d, out = [];
  for (const [x, y] of ring) {
    const p = [Math.round(x * k) / k, Math.round(y * k) / k];
    const l = out[out.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p);
  }
  return out;
};
/** Polygons -> cleaned MultiPolygon-ish list, dropping specks and (for focus) pieces beyond the antimeridian. */
function cleanGeometry(geom, focus, { dropEast = false } = {}) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const poly of polys) {
    const outer = roundRing(poly[0], focus ? 3 : 2);
    if (outer.length < 4) continue;
    // Alaska's far-western Aleutians sit at +166..+180 longitude, on the wrong side of the date line for a Mercator map centred on the Americas. Drop them.
    if (dropEast && outer.every(([x]) => x > 0)) continue;
    if (bboxArea(outer) < (focus ? MIN_AREA.focus : MIN_AREA.ctx)) continue;
    const holes = poly.slice(1).map((r) => roundRing(r, focus ? 3 : 2)).filter((r) => r.length >= 4 && bboxArea(r) >= (focus ? MIN_AREA.focus : MIN_AREA.ctx));
    out.push([outer, ...holes]);
  }
  if (!out.length) return null;
  return out.length === 1 ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out };
}

const features = [];
const unmatched = new Set(EUROPE.keys());

// United States: every state (and PR, VI) from us-atlas.
{
  const topo = load("us-atlas/states-10m.json");
  const t = thin(topo, "states", () => true, T_US, T_US);
  const fc = feature(t, topo.objects.states);
  for (const f of fc.features) {
    const code = US_FIPS[f.id];
    if (!code) continue;
    const geometry = cleanGeometry(f.geometry, true, { dropEast: code === "AK" });
    if (geometry) features.push({ type: "Feature", properties: { code, focus: 1 }, geometry });
  }
}
// Europe (focus) and the rest of the world (context) from world-atlas 50m.
{
  const topo = load("world-atlas/countries-50m.json");
  const isEu = (g) => EUROPE.has(g.properties.name);
  const t = thin(topo, "countries", isEu, T_FOCUS, T_CTX);
  const fc = feature(t, topo.objects.countries);
  for (const f of fc.features) {
    const name = f.properties.name;
    if (SKIP.has(name)) continue;
    const focus = EUROPE.has(name);
    unmatched.delete(name);
    const geometry = cleanGeometry(f.geometry, focus);
    if (geometry) features.push({ type: "Feature", properties: { code: focus ? EUROPE.get(name) : name, focus: focus ? 1 : 0 }, geometry });
  }
}
if (unmatched.size) console.warn("Europe names not found in world-atlas:", [...unmatched].join(", "));
const json = JSON.stringify({ type: "FeatureCollection", features });
writeFileSync(new URL("../src/map/land.json", import.meta.url), json);
console.log(features.length, "features,", (json.length / 1024).toFixed(0), "KB");
