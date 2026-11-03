import { IconLayer, PathLayer, ScatterplotLayer, TextLayer, type TextLayerProps } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { Airport } from "@arg/contracts";
import type { MapColors } from "./colors";
import { aircraftAt, type AggEdge, type MapModel, type RouteGeo } from "./model";
import { routePath } from "./geo";
import type { ProfitTier, Rgba } from "./types";

export type ZoomBand = "far" | "mid" | "near";
export const MID_ZOOM = 4.7;
export const NEAR_ZOOM = 7.6;
export const bandOf = (z: number): ZoomBand => (z < MID_ZOOM ? "far" : z < NEAR_ZOOM ? "mid" : "near");

const SPRITE = (() => {
  const plane = `<path fill="#fff" d="M32 4c2.4 0 4.2 2.4 4.2 5.4v15.6l22.6 13.8v5.9L36.2 38v12.4l6.2 4.6v4.3L32 56l-10.4 3.3V55l6.2-4.6V38L5.2 44.7v-5.9L27.8 25V9.4C27.8 6.4 29.6 4 32 4z"/>`;
  const glyph = `<g transform="translate(64 0)" fill="none" stroke="#fff" stroke-linecap="round"><circle cx="32" cy="32" r="23" stroke-width="6"/><path stroke-width="5" d="M32 14v36M16.4 23l31.2 18M16.4 41l31.2-18"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64">${plane}${glyph}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
})();
const ICONS = {
  plane: { x: 0, y: 0, width: 64, height: 64, mask: true },
  glyph: { x: 64, y: 0, width: 64, height: 64, mask: true },
};

const tierColor = (c: MapColors, t: ProfitTier): Rgba => c[t];
const withA = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], a];

export interface LayerInput {
  model: MapModel;
  colors: MapColors;
  band: ZoomBand;
  selectedRoute: string | null;
  selectedAirport: string | null;
  dark: boolean;
  /** Airport ids whose label survived screen-space decluttering (null = show all). */
  labelIds: Set<string> | null;
  /** Airport ids that survived level-of-detail selection (null = apply the simple hub rule). */
  markerIds?: Set<string> | null;
  /** Show every airport even in the far band (route creation: all airports are clickable). */
  allAirports?: boolean;
}

const routeWidth = (freq: number) => Math.max(1.4, Math.min(7, 1 + Math.sqrt(freq) * 0.75));
const aggWidth = (freq: number) => Math.max(3, Math.min(18, 2 + Math.sqrt(freq) * 1.1));

/** Layers that only change with zoom band, data, theme or selection (not with simTime). */
export function buildStaticLayers(inp: LayerInput): Layer[] {
  const { model, colors: c, band, selectedRoute, selectedAirport, dark, labelIds, allAirports, markerIds } = inp;
  const layers: Layer[] = [];
  const alpha = dark ? 205 : 225;
  const far = band === "far";

  if (far) {
    layers.push(
      new PathLayer<AggEdge>({
        id: "agg-casing", data: model.agg, getPath: (d) => d.path, getColor: c.casing, getWidth: (d) => aggWidth(d.freq) + 3,
        widthUnits: "pixels", capRounded: true, jointRounded: true, pickable: false,
      }),
      new PathLayer<AggEdge>({
        id: "agg-routes", data: model.agg, getPath: (d) => d.path, getColor: (d) => withA(tierColor(c, d.tier), alpha),
        getWidth: (d) => aggWidth(d.freq), widthUnits: "pixels", capRounded: true, jointRounded: true, pickable: true,
        autoHighlight: true, highlightColor: [255, 255, 255, 70], updateTriggers: { getColor: [c, dark] },
      }),
    );
  } else {
    const sel = selectedRoute ? model.routes.filter((g) => g.route.id === selectedRoute) : [];
    layers.push(
      new PathLayer<RouteGeo>({
        id: "route-casing", data: model.routes, getPath: (d) => d.path, getColor: c.casing,
        getWidth: (d) => routeWidth(d.route.weeklyFrequency) + 2.5, widthUnits: "pixels", capRounded: true, jointRounded: true,
        pickable: false, updateTriggers: { getColor: [c] },
      }),
      new PathLayer<RouteGeo>({
        id: "selected-route", data: sel, getPath: (d) => d.path, getColor: withA(c.select, 255),
        getWidth: (d) => routeWidth(d.route.weeklyFrequency) + 6, widthUnits: "pixels", capRounded: true, jointRounded: true,
        pickable: false, updateTriggers: { getColor: [c] },
      }),
      new PathLayer<RouteGeo>({
        id: "routes", data: model.routes, getPath: (d) => d.path,
        getColor: (d) => withA(tierColor(c, d.route.tier), d.route.tier === "planned" ? alpha - 40 : alpha),
        getWidth: (d) => routeWidth(d.route.weeklyFrequency), widthUnits: "pixels", capRounded: true, jointRounded: true,
        pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 80], updateTriggers: { getColor: [c, dark] },
      }),
    );
  }

  const shown: Airport[] = markerIds ? model.airports.filter((a) => markerIds.has(a.id)) : far && !allAirports ? model.airports.filter((a) => model.hubs.has(a.id)) : model.airports;
  const selAp = selectedAirport ? model.byId.get(selectedAirport) : undefined;
  const showGlyph = band === "near";
  const isHub = (a: Airport) => model.hubs.has(a.id);

  layers.push(
    new ScatterplotLayer<Airport>({
      id: "airport-select", data: selAp ? [selAp] : [], getPosition: (a) => [a.lon, a.lat],
      getRadius: showGlyph ? 18 : 12, radiusUnits: "pixels", filled: false, stroked: true, getLineColor: c.airportHub,
      getLineWidth: 2.5, lineWidthUnits: "pixels", updateTriggers: { getLineColor: [c], getRadius: [band] },
    }),
  );
  if (showGlyph) {
    layers.push(
      new IconLayer<Airport>({
        id: "airport-glyph", data: shown, iconAtlas: SPRITE, iconMapping: ICONS, getIcon: () => "glyph",
        getPosition: (a) => [a.lon, a.lat], getSize: (a) => (isHub(a) ? 26 : 22), sizeUnits: "pixels",
        getColor: (a) => (isHub(a) ? c.airportHub : c.airportFill), pickable: true, autoHighlight: true,
        highlightColor: [255, 255, 255, 120], updateTriggers: { getColor: [c] },
      }),
    );
  } else {
    layers.push(
      new ScatterplotLayer<Airport>({
        id: "airports", data: shown, getPosition: (a) => [a.lon, a.lat],
        getRadius: (a) => (far && !allAirports ? 7 : far ? (isHub(a) ? 7 : 5) : isHub(a) ? 6 : 4.2), radiusUnits: "pixels",
        getFillColor: (a) => (isHub(a) ? c.airportHub : c.airportFill), getLineColor: c.airportStroke,
        getLineWidth: 1.6, lineWidthUnits: "pixels", stroked: true, pickable: true, autoHighlight: true,
        highlightColor: [255, 255, 255, 120], updateTriggers: { getRadius: [band, allAirports], getFillColor: [c], getLineColor: [c] },
      }),
    );
  }

  layers.push(
    new TextLayer<Airport>({
      id: "airport-labels", data: labelIds ? shown.filter((a) => labelIds.has(a.id)) : shown, getPosition: (a) => [a.lon, a.lat],
      getText: (a) => labelText(a, band),
      getSize: (a) => (isHub(a) ? 14 : 12), sizeUnits: "pixels", getColor: c.label,
      getPixelOffset: showGlyph ? [20, 0] : [far ? 12 : 9, 0], getTextAnchor: "start", getAlignmentBaseline: "center",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontWeight: 650,
      fontSettings: { sdf: true, buffer: 8, radius: 8 }, outlineWidth: 3.2, outlineColor: c.labelHalo,
      characterSet: "auto", billboard: true, pickable: false,
      updateTriggers: { getColor: [c], getText: [band], getPixelOffset: [band], getSize: [band] },
    } as TextLayerProps<Airport>),
  );
  return layers;
}

export function buildAircraftLayer(model: MapModel, c: MapColors, band: ZoomBand, simTime: number): Layer {
  const data = aircraftAt(model.routes, simTime, band === "far");
  return new IconLayer({
    id: "aircraft", data, iconAtlas: SPRITE, iconMapping: ICONS, getIcon: () => "plane",
    getPosition: (d: { position: [number, number] }) => d.position, getAngle: (d: { angle: number }) => d.angle,
    getSize: band === "far" ? 13 : 15, sizeUnits: "pixels", getColor: c.aircraft, pickable: false,
    updateTriggers: { getColor: [c] },
  });
}

export const labelText = (a: Airport, band: ZoomBand) => (band === "near" ? `${a.id}  ${a.name}` : a.id);

/** Greedy screen-space label declutter: higher-priority airports claim space first. */
export function declutterLabels(
  airports: Airport[], rank: ReadonlyMap<string, number>, band: ZoomBand,
  project: (lon: number, lat: number) => { x: number; y: number }, width: number, height: number,
): Set<string> {
  const order = [...airports].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || b.slotsPerHour - a.slotsPerHour);
  const boxes: [number, number, number, number][] = [];
  const keep = new Set<string>();
  const offX = band === "near" ? 20 : band === "far" ? 12 : 9;
  for (const a of order) {
    const p = project(a.lon, a.lat);
    if (p.x < -50 || p.y < -20 || p.x > width + 50 || p.y > height + 20) continue;
    const w = labelText(a, band).length * 7.6 + 6;
    const box: [number, number, number, number] = [p.x - 10, p.y - 10, p.x + offX + w, p.y + 10];
    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    keep.add(a.id);
  }
  return keep;
}

/** Route-creation preview: dashed great-circle arc plus rings on the chosen ends. Ends may be missing while editing. */
export interface Ghost { a: Airport | null; b: Airport | null }

/** Split a path into dash segments (every other chunk of `on` points, gap `off`). */
export function dashPath(path: [number, number][], on = 3, off = 2): [number, number][][] {
  const out: [number, number][][] = [];
  for (let i = 0; i + 1 < path.length; i += on + off) out.push(path.slice(i, Math.min(path.length, i + on + 1)));
  return out;
}

export function buildGhostLayers(ghost: Ghost, c: MapColors): Layer[] {
  const layers: Layer[] = [];
  const ends = [ghost.a, ghost.b].filter((x): x is Airport => !!x);
  if (ghost.a && ghost.b) {
    const path = routePath(ghost.a.lon, ghost.a.lat, ghost.b.lon, ghost.b.lat, 48);
    const dashes = dashPath(path);
    layers.push(
      new PathLayer<[number, number][]>({
        id: "ghost-casing", data: dashes, getPath: (d) => d, getColor: c.casing, getWidth: 7, widthUnits: "pixels", capRounded: true, pickable: false,
        updateTriggers: { getColor: [c] },
      }),
      new PathLayer<[number, number][]>({
        id: "ghost-arc", data: dashes, getPath: (d) => d, getColor: withA(c.airportHub, 255), getWidth: 3.6, widthUnits: "pixels", capRounded: true, pickable: false,
        updateTriggers: { getColor: [c] },
      }),
    );
  }
  if (ends.length) {
    layers.push(
      new ScatterplotLayer<Airport>({
        id: "ghost-ends", data: ends, getPosition: (a) => [a.lon, a.lat], getRadius: 15, radiusUnits: "pixels", filled: true, stroked: true,
        getFillColor: withA(c.airportHub, 70), getLineColor: withA(c.airportHub, 255), getLineWidth: 3, lineWidthUnits: "pixels", pickable: false,
        updateTriggers: { getFillColor: [c], getLineColor: [c] },
      }),
    );
  }
  return layers;
}

/** A rival-served market drawn on the map (fog of war: carriers and seats only). */
export interface RivalMapEdge { a: Airport; b: Airport; path: [number, number][]; carriers: string[]; seats: number }

export function buildRivalEdges(markets: Array<{ origin: string; destination: string; carriers: Array<{ name: string; weeklySeats: number }>; totalWeeklySeats: number }>, airports: Map<string, Airport>): RivalMapEdge[] {
  const out: RivalMapEdge[] = [];
  for (const m of markets) {
    const a = airports.get(m.origin), b = airports.get(m.destination);
    if (!a || !b) continue;
    out.push({ a, b, path: routePath(a.lon, a.lat, b.lon, b.lat, 32), carriers: m.carriers.map((c) => c.name), seats: m.totalWeeklySeats });
  }
  return out;
}

export function buildRivalLayer(edges: RivalMapEdge[], c: MapColors): Layer {
  return new PathLayer<RivalMapEdge>({
    id: "rival-routes", data: edges, getPath: (d) => d.path, getColor: c.rival,
    getWidth: (d) => Math.max(1.2, Math.min(4, 0.8 + Math.sqrt(d.seats / 400))), widthUnits: "pixels", capRounded: true, jointRounded: true,
    pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 60], updateTriggers: { getColor: [c] },
  });
}
