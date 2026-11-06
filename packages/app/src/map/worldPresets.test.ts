import { describe, expect, it } from "vitest";
import { airports } from "@arg/data";
import { hubCandidates } from "@arg/sim";
import { CAMERA_PRESETS, PRESET_LABEL, boundsFor, presetForAirport, type Bounds } from "./presets";
import { markerBudget, markerSpacing, selectMarkers } from "./lod";
import { buildModel, pickHubs, toDisplay } from "./model";
import { CONTINENT_ORDER, continentOf, countryName } from "../routes/geoNames";
import { hubsByContinent, START_HUB_COUNT } from "../save/startHubs";
import type { CameraPresetId } from "./types";

const A = new Map(airports.map((a) => [a.id, a]));
const inside = (b: Bounds, a: { lon: number; lat: number }) => a.lon >= b[0] && a.lon <= b[2] && a.lat >= b[1] && a.lat <= b[3];

describe("geo names for the whole globe", () => {
  it("every country in the data has a real name and a continent (no 'Other', no raw codes)", () => {
    for (const c of new Set(airports.map((a) => a.country))) {
      expect(continentOf(c), c).not.toBe("Other");
      expect(countryName(c), c).not.toBe(c);
    }
  });
  it("continents are right for sample countries", () => {
    const want: Record<string, string> = {
      US: "North America", CA: "North America", MX: "North America", DO: "North America", BR: "South America", CL: "South America", GB: "Europe", DE: "Europe",
      ZA: "Africa", EG: "Africa", KE: "Africa", AE: "Asia", TR: "Asia", IN: "Asia", JP: "Asia", SG: "Asia", AU: "Oceania", NZ: "Oceania", FJ: "Oceania", GU: "Oceania",
    };
    for (const [c, k] of Object.entries(want)) expect(continentOf(c), c).toBe(k);
    expect(continentOf("ZZ")).toBe("Other");
  });
});

describe("camera presets", () => {
  const regional: Array<[CameraPresetId, string[], string[]]> = [
    ["asia", ["SIN", "BKK", "HND", "PEK", "DEL", "HKG", "CGK", "MNL", "ICN"], ["DXB", "LHR", "SYD"]],
    ["middleEast", ["DXB", "DOH", "IST", "TLV", "RUH", "THR", "IKA"], ["SIN", "CDG"]],
    ["africa", ["JNB", "CAI", "NBO", "ADD", "LOS", "CMN"], ["MAD", "DXB"]],
    ["southAmerica", ["GRU", "BOG", "SCL", "EZE", "LIM"], ["MIA", "MEX"]],
    ["oceania", ["SYD", "MEL", "AKL", "BNE", "NAN"], ["SIN", "HNL"]],
    ["canadaMexico", ["YYZ", "YVR", "MEX", "CUN", "YYC"], ["GRU", "LHR"]],
  ];
  it("each new preset has a label, and frames its airports but not those of other regions", () => {
    for (const [p, ins, outs] of regional) {
      expect(CAMERA_PRESETS).toContain(p);
      expect(PRESET_LABEL[p].length).toBeGreaterThan(3);
      const b = boundsFor(p, airports);
      for (const id of ins) if (A.has(id)) expect(inside(b, toDisplay(A.get(id)!)), `${p} ${id}`).toBe(true);
      for (const id of outs) if (A.has(id)) expect(inside(b, toDisplay(A.get(id)!)), `${p} not ${id}`).toBe(false);
    }
    expect(new Set(CAMERA_PRESETS).size).toBe(CAMERA_PRESETS.length);
  });
  it("every airport lies in the preset that presetForAirport gives it, or is a far island", () => {
    let outside = 0;
    for (const a of airports) {
      const p = presetForAirport(a);
      if (p !== "europe" && !inside(boundsFor(p, airports), toDisplay(a))) outside++; // the Europe preset is the pre-globe one (Canaries, Nordics beyond 62N lie outside)
    }
    // Only remote islands fall outside their region frame (Polynesia, Cabo Verde, Reunion, Galapagos, Easter Island, Mauritius, Seychelles).
    expect(outside).toBeLessThanOrEqual(14);
  });
  it("a home airport flies the camera to its region", () => {
    const want: Record<string, CameraPresetId> = { LAX: "west", JFK: "us", HNL: "hawaii", ANC: "alaska", LHR: "europe", SIN: "asia", HND: "asia", DXB: "middleEast", IST: "middleEast", GRU: "southAmerica", SYD: "oceania", JNB: "africa", YYZ: "canadaMexico", MEX: "canadaMexico" };
    for (const [id, p] of Object.entries(want)) expect(presetForAirport(A.get(id)!), id).toBe(p);
  });
});

describe("map with the whole-globe airport set", () => {
  it("hubs cover every continent and stay within the cap", () => {
    const hubs = pickHubs(airports.map(toDisplay));
    expect(new Set(hubs).size).toBe(hubs.length);
    expect(hubs.length).toBeLessThanOrEqual(32);
    const conts = new Set(hubs.map((h) => continentOf(A.get(h)!.country)));
    for (const c of ["North America", "South America", "Europe", "Africa", "Asia", "Oceania"]) expect(conts.has(c as never), c).toBe(true);
  });
  it("far-zoom hub corridors of a US/Europe network stay between US and European clusters", () => {
    const routes = [["LAX", "JFK"], ["SFO", "ORD"], ["JFK", "LHR"], ["LHR", "FRA"], ["FRA", "MAD"], ["LAX", "HNL"]].map(([o, d], i) => ({
      id: `r${i}`, origin: o!, destination: d!, weeklyFrequency: 7, tier: "profit" as const,
    }));
    const m = buildModel(airports, routes as never);
    for (const e of m.agg) {
      for (const x of [e.a, e.b]) expect(["North America", "Europe"], x.id).toContain(continentOf(x.country));
    }
    expect(m.agg.length).toBeLessThanOrEqual(routes.length);
  });
  it("markers: every preset keeps a readable set within the zoom budget on 1,006 airports", () => {
    const model = buildModel(airports, []);
    const W = 1280, H = 720;
    for (const p of CAMERA_PRESETS) {
      const [w, s, e, n] = boundsFor(p, airports);
      // Web Mercator at the zoom that fits the bounds in the viewport
      const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
      const spanX = ((e - w) / 360) * 512, spanY = ((mercY(n) - mercY(s)) / (2 * Math.PI)) * 512;
      const zoom = Math.min(Math.log2(W / spanX), Math.log2(H / spanY));
      const scale = 512 * 2 ** zoom, cx = (w + e) / 2, cy = (mercY(n) + mercY(s)) / 2;
      const project = (lon: number, lat: number) => ({ x: W / 2 + ((lon - cx) / 360) * scale, y: H / 2 - ((mercY(lat) - cy) / (2 * Math.PI)) * scale });
      const band = zoom < 4.7 ? "far" : "mid";
      const t = performance.now();
      const kept = selectMarkers({ airports: model.airports, rank: model.rank, project, width: W, height: H, spacing: markerSpacing(band), budget: markerBudget(zoom) });
      expect(performance.now() - t, p).toBeLessThan(150);
      expect(kept.size, p).toBeLessThanOrEqual(markerBudget(zoom));
      if (p !== "hawaii") expect(kept.size, p).toBeGreaterThanOrEqual(8);
      // the largest airport in the frame is always drawn
      const best = model.airports.filter((a) => { const q = project(a.lon, a.lat); return q.x > 0 && q.x < W && q.y > 0 && q.y < H; }).sort((x, y) => (model.rank.get(x.id) ?? 1e9) - (model.rank.get(y.id) ?? 1e9))[0];
      if (best) expect(kept.has(best.id), p).toBe(true);
    }
  });
});

describe("start screen hubs", () => {
  const hubs = hubCandidates(airports, START_HUB_COUNT);
  it("offers LAX first and hubs on every continent", () => {
    expect(hubs[0]!.id).toBe("LAX");
    const groups = hubsByContinent(hubs);
    expect(groups.map((g) => g.continent)).toEqual(CONTINENT_ORDER.filter((c) => groups.some((g) => g.continent === c)));
    for (const c of ["North America", "South America", "Europe", "Africa", "Asia", "Oceania"]) expect(groups.some((g) => g.continent === c), c).toBe(true);
    expect(groups.reduce((n, g) => n + g.hubs.length, 0)).toBe(hubs.length);
    for (const id of ["SIN", "GRU", "DXB", "SYD", "JNB", "HND", "DEL", "MEX", "YYZ"]) expect(hubs.map((h) => h.id), id).toContain(id);
  });
});
