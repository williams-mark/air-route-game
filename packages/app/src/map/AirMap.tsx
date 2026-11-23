import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Airport } from "@arg/contracts";
import { readMapColors } from "./colors";
import { applyStyleColors, buildStyle } from "./style";
import type { RivalMapEdge } from "./layers";
import { bandOf, buildAircraftLayer, buildGhostLayers, buildRivalEdges, buildRivalLayer, buildStaticLayers, declutterLabels, labelText, type Ghost, type ZoomBand } from "./layers";
import { buildModel, toDisplay, type RouteGeo } from "./model";
import { markerBudget, markerSpacing, selectMarkers } from "./lod";
import { boundsFor, loadCamera, saveCamera } from "./presets";
import type { CameraPresetId, MapRoute, Theme } from "./types";

export interface AirMapHandle {
  zoomBy(delta: number): void;
  getMap(): MLMap | null;
}

export interface AirMapProps {
  airports: Airport[];
  routes: MapRoute[];
  /** Sim-minutes. Aircraft positions are a pure function of this; hold it constant to pause. */
  simTime: number;
  theme: Theme;
  preset: CameraPresetId;
  /** Increment to (re)fly to `preset`. */
  presetNonce: number;
  selectedRouteId?: string | null;
  selectedAirportId?: string | null;
  /** Draw only the routes (own and competitor) touching this airport; null = all. */
  focusAirportId?: string | null;
  /** Right-side screen padding (px) so presets centre in the free area. */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Route-creation preview arc (dashed) and end markers. */
  ghost?: Ghost | null;
  /** Make every airport visible and clickable at all zoom levels. */
  showAllAirports?: boolean;
  /** Competitor markets to draw in a muted colour (undefined/empty = layer off). */
  rivalMarkets?: Array<{ origin: string; destination: string; carriers: Array<{ name: string; weeklySeats: number }>; totalWeeklySeats: number }>;
  onSelectRoute?: (id: string) => void;
  onSelectAirport?: (id: string) => void;
}

interface Tip { x: number; y: number; text: string }

/** Zoom at which the whole globe fits the free area when centred at `lat` (the globe's radius is 512 x 2^zoom x cos(lat) / 2pi px). */
export function wholeGlobeZoom(widthPx: number, heightPx: number, lat: number): number {
  const radius = 0.46 * Math.max(120, Math.min(widthPx, heightPx));
  return Math.log2((radius * 2 * Math.PI) / (512 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))));
}

function fitCamera(map: MLMap, preset: CameraPresetId, airports: readonly Airport[], padding: Required<NonNullable<AirMapProps["padding"]>>, focus?: { lon: number; lat: number } | null) {
  if (preset === "world") {
    // On a globe "world" is the whole sphere (no single view shows every airport), turned to the player's network (`focus`, the
    // airport most of their routes touch) or, without routes, to where they are looking.
    const c = focus ? { lng: focus.lon, lat: focus.lat } : map.getCenter(), box = map.getContainer();
    const lat = Math.max(-35, Math.min(45, c.lat));
    const zoom = wholeGlobeZoom(box.clientWidth - padding.left - padding.right, box.clientHeight - padding.top - padding.bottom, lat);
    return { center: [c.lng, lat] as [number, number], zoom: Math.max(map.getMinZoom(), zoom), padding };
  }
  const [w, s, e, n] = boundsFor(preset, airports);
  return map.cameraForBounds([[w, s], [e, n]], { padding })!;
}

const tierWord = { profit: "Profitable", marginal: "Marginal", loss: "Loss-making", planned: "Planned" } as const;

export const AirMap = forwardRef<AirMapHandle, AirMapProps>(function AirMap(props, ref) {
  const { airports, routes, simTime, theme, preset, presetNonce, selectedRouteId = null, selectedAirportId = null, focusAirportId = null, ghost = null, showAllAirports = false, rivalMarkets } = props;
  const pad = useMemo(() => ({ top: 70, bottom: 60, left: 60, right: 60, ...props.padding }), [props.padding]);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const cbRef = useRef(props);
  cbRef.current = props;
  const padRef = useRef(pad);
  padRef.current = pad;
  const [band, setBand] = useState<ZoomBand>("far");
  const [ready, setReady] = useState(false);
  const [lod, setLod] = useState<{ markers: Set<string>; labels: Set<string> } | null>(null);
  const airportsRef = useRef(airports);
  airportsRef.current = airports;
  const [tip, setTip] = useState<Tip | null>(null);
  /** Airport labels as HTML over the map (text layers do not draw on the globe): screen position per kept label. */
  const [labels, setLabels] = useState<Array<{ id: string; text: string; x: number; y: number; hub: boolean }>>([]);

  const model = useMemo(() => buildModel(airports, routes), [airports, routes]);
  // The airport most routes touch (the home hub in practice): where the "world" view turns the globe to.
  const focusRef = useRef<{ lon: number; lat: number } | null>(null);
  focusRef.current = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of routes) for (const id of [r.origin, r.destination]) n.set(id, (n.get(id) ?? 0) + 1);
    let best: string | null = null;
    for (const [id, k] of n) if (best === null || k > n.get(best)!) best = id;
    const a = best ? model.byId.get(best) : undefined;
    return a ? { lon: a.lon, lat: a.lat } : null;
  }, [routes, model]);
  // Globe: false for a point on the far side. Stable identity; it reads the live camera.
  const visible = useRef((lon: number, lat: number) => {
    const t = mapRef.current?.transform as unknown as { isLocationOccluded?: (l: maplibregl.LngLat) => boolean } | undefined;
    return !t?.isLocationOccluded?.(new maplibregl.LngLat(lon, lat));
  }).current;
  /** Bumped when the camera moves, so layers that hide far-side points are rebuilt. */
  const [view, setView] = useState(0);
  const colors = useMemo(() => readMapColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    zoomBy: (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 220 }),
    getMap: () => mapRef.current,
  }));

  // Map creation (once).
  useEffect(() => {
    const c = readMapColors();
    const map = new maplibregl.Map({
      container: el.current!, style: buildStyle(c), attributionControl: false, minZoom: 1, maxZoom: 13,
      renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: false,
      doubleClickZoom: true, bearing: 0, pitch: 0, center: [-138, 36], zoom: 3.4, fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.scrollZoom.setWheelZoomRate(1 / 300); // gentler, smooth for trackpads
    map.scrollZoom.setZoomRate(1 / 90);
    const overlay = new MapboxOverlay({
      interleaved: true, layers: [], pickingRadius: 6, // interleaved: deck.gl draws in the map's own context, which the globe projection needs
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
      onHover: (info) => {
        const o = info.object as (RouteGeo | Airport | undefined);
        if (!o || !info.layer) { setTip(null); return; }
        const id = info.layer.id;
        let text = "";
        if (id === "routes") {
          const g = o as RouteGeo;
          text = `${g.o.id} → ${g.d.id} · ${g.route.weeklyFrequency}/wk · ${tierWord[g.route.tier]} · ${Math.round(g.km)} km`;
        } else if (id === "rival-routes") {
          const g = o as unknown as RivalMapEdge;
          text = `${g.a.id} ⇄ ${g.b.id} · ${g.carriers.join(", ")} · ${g.seats.toLocaleString()} seats/wk (competitor)`;
        } else if (id === "airports" || id === "airport-glyph") {
          const a = o as Airport;
          text = `${a.id} · ${a.name}`;
        } else { setTip(null); return; }
        setTip({ x: info.x, y: info.y, text });
      },
      onClick: (info) => {
        if (!info.object || !info.layer) return;
        const id = info.layer.id;
        if (id === "routes") cbRef.current.onSelectRoute?.((info.object as RouteGeo).route.id);
        else if (id === "airports" || id === "airport-glyph") cbRef.current.onSelectAirport?.((info.object as Airport).id);
      },
    });
    map.addControl(overlay as never);
    mapRef.current = map;
    overlayRef.current = overlay;
    (window as unknown as { __argMap?: MLMap }).__argMap = map;

    const updateBand = () => setBand((b) => { const n = bandOf(map.getZoom()); return n === b ? b : n; });
    map.on("zoom", updateBand);
    map.on("load", () => {
      const saved = loadCamera();
      if (saved) map.jumpTo({ center: saved.center, zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), saved.zoom)) });
      else map.jumpTo(fitCamera(map, "world", airportsRef.current, padRef.current, focusRef.current));
      updateBand();
      setReady(true);
    });

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.documentElement.dataset.view !== "map") return; // other views own the keyboard
      // +/- and 1-5 are game-speed keys in the shell; map zoom uses PageUp/PageDown.
      if (e.key === "PageUp") { map.easeTo({ zoom: map.getZoom() + 0.7, duration: 200 }); e.preventDefault(); }
      else if (e.key === "PageDown") { map.easeTo({ zoom: map.getZoom() - 0.7, duration: 200 }); e.preventDefault(); }
      else if (e.key.startsWith("Arrow")) {
        const k = 120;
        map.panBy([e.key === "ArrowLeft" ? -k : e.key === "ArrowRight" ? k : 0, e.key === "ArrowUp" ? -k : e.key === "ArrowDown" ? k : 0], { duration: 200 });
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    // Remember the camera (debounced) so the next session opens where the player left off.
    let saveTimer = 0;
    const remember = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => { const c = map.getCenter(); saveCamera({ center: [c.lng, c.lat], zoom: map.getZoom() }); }, 400);
    };
    map.on("moveend", remember);
    return () => {
      window.clearTimeout(saveTimer);
      window.removeEventListener("keydown", onKey);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Level of detail after every camera move: pick the markers that fit (biggest first), then declutter their labels.
  // O(n) per move with a spatial hash, cheap for a few thousand airports.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const run = () => {
      const z = map.getZoom(), b = bandOf(z), c = map.getContainer();
      const project = (lon: number, lat: number) => map.project([lon, lat]);
      const priority = new Set(model.served);
      if (selectedAirportId) priority.add(selectedAirportId);
      const markers = selectMarkers({
        airports: model.airports.filter((a) => visible(a.lon, a.lat)), rank: model.rank, priority, project, width: c.clientWidth, height: c.clientHeight,
        spacing: showAllAirports ? 10 : markerSpacing(b), budget: showAllAirports ? Infinity : markerBudget(z),
      });
      const shown = model.airports.filter((a) => markers.has(a.id));
      const kept = declutterLabels(shown, model.rank, b, project, c.clientWidth, c.clientHeight);
      setLod({ markers, labels: kept });
      const off = b === "near" ? 14 : b === "far" ? 12 : 9;
      setLabels(shown.filter((a) => kept.has(a.id)).map((a) => { const p = project(a.lon, a.lat); return { id: a.id, text: labelText(a, b), x: Math.round(p.x + off), y: Math.round(p.y), hub: model.hubs.has(a.id) }; }));
      setView((v) => v + 1);
    };
    run();
    map.on("moveend", run);
    // While the globe turns, refresh at most about 30 times a second so far-side markers do not show through; moveend does the
    // exact final pass. Measured with 500 routes and 1,006 airports: about 5-8 ms of work per refresh (marker choice, labels,
    // horizon clipping and layer rebuild), so refreshing on every frame would take half of a 60 fps frame.
    let raf = 0;
    let last = 0;
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame((t) => {
        raf = 0;
        if (t - last < 30) { onMove(); return; }
        last = t;
        run();
      });
    };
    map.on("move", onMove);
    return () => { map.off("moveend", run); map.off("move", onMove); cancelAnimationFrame(raf); };
  }, [ready, model, showAllAirports, selectedAirportId]);

  // A game has just started or loaded (the first routes appear): turn the globe to the player's network.
  const hadFocus = useRef(false);
  const focusKey = focusRef.current ? `${focusRef.current.lon},${focusRef.current.lat}` : "";
  useEffect(() => {
    const map = mapRef.current, f = focusRef.current;
    if (!map || !ready) return;
    if (f && !hadFocus.current && !visible(f.lon, f.lat)) map.jumpTo({ center: [f.lon, Math.max(-35, Math.min(45, f.lat))] });
    hadFocus.current = !!f;
  }, [ready, focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Camera presets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || presetNonce === 0) return;
    map.flyTo({ ...fitCamera(map, preset, airportsRef.current, pad, focusRef.current), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1800, essential: true });
  }, [presetNonce, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme restyle.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) applyStyleColors(map, colors);
  }, [colors, ready]);

  const staticLayers = useMemo(
    () => buildStaticLayers({ model, colors, band, selectedRoute: selectedRouteId, selectedAirport: selectedAirportId, dark: theme === "dark", labelIds: lod?.labels ?? null, markerIds: lod?.markers ?? null, allAirports: showAllAirports, visible, domLabels: true, focusAirport: focusAirportId }),
    [model, colors, band, selectedRouteId, selectedAirportId, focusAirportId, theme, lod, showAllAirports],
  );

  const rivalLayer = useMemo(() => {
    if (!rivalMarkets || rivalMarkets.length === 0) return null;
    const markets = focusAirportId ? rivalMarkets.filter((m) => m.origin === focusAirportId || m.destination === focusAirportId) : rivalMarkets;
    return buildRivalLayer(buildRivalEdges(markets, model.byId), colors, visible);
  }, [rivalMarkets, model, colors, view, focusAirportId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const ghostLayers = ghost ? buildGhostLayers({ a: ghost.a && toDisplay(ghost.a), b: ghost.b && toDisplay(ghost.b) }, colors, visible) : [];
    overlayRef.current?.setProps({ layers: [...(rivalLayer ? [rivalLayer] : []), ...staticLayers, ...ghostLayers, buildAircraftLayer(model, colors, band, simTime, visible, focusAirportId)] });
  }, [ready, staticLayers, rivalLayer, model, colors, band, simTime, ghost, view, focusAirportId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={el} className="map-root" />
      <div className="map-labels" aria-hidden="true">
        {labels.map((l) => <span key={l.id} className={l.hub ? "hub" : undefined} style={{ transform: `translate(${l.x}px, ${l.y}px) translateY(-50%)` }}>{l.text}</span>)}
      </div>
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </>
  );
});
