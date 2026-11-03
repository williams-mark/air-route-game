import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Airport } from "@arg/contracts";
import { readMapColors } from "./colors";
import { applyStyleColors, buildStyle } from "./style";
import type { RivalMapEdge } from "./layers";
import { bandOf, buildAircraftLayer, buildGhostLayers, buildRivalEdges, buildRivalLayer, buildStaticLayers, declutterLabels, type Ghost, type ZoomBand } from "./layers";
import { buildModel, toDisplay, type AggEdge, type RouteGeo } from "./model";
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

function fitCamera(map: MLMap, preset: CameraPresetId, airports: readonly Airport[], padding: Required<NonNullable<AirMapProps["padding"]>>) {
  const [w, s, e, n] = boundsFor(preset, airports);
  return map.cameraForBounds([[w, s], [e, n]], { padding })!;
}

const tierWord = { profit: "Profitable", marginal: "Marginal", loss: "Loss-making", planned: "Planned" } as const;

export const AirMap = forwardRef<AirMapHandle, AirMapProps>(function AirMap(props, ref) {
  const { airports, routes, simTime, theme, preset, presetNonce, selectedRouteId = null, selectedAirportId = null, ghost = null, showAllAirports = false, rivalMarkets } = props;
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

  const model = useMemo(() => buildModel(airports, routes), [airports, routes]);
  const colors = useMemo(() => readMapColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    zoomBy: (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 220 }),
    getMap: () => mapRef.current,
  }));

  // Map creation (once).
  useEffect(() => {
    const c = readMapColors();
    const map = new maplibregl.Map({
      container: el.current!, style: buildStyle(c), attributionControl: false, minZoom: 1.8, maxZoom: 13,
      renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: false,
      doubleClickZoom: true, bearing: 0, pitch: 0, center: [-138, 36], zoom: 3.4, fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.scrollZoom.setWheelZoomRate(1 / 300); // gentler, smooth for trackpads
    map.scrollZoom.setZoomRate(1 / 90);
    const overlay = new MapboxOverlay({
      interleaved: false, layers: [], pickingRadius: 6,
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
      onHover: (info) => {
        const o = info.object as (RouteGeo | AggEdge | Airport | undefined);
        if (!o || !info.layer) { setTip(null); return; }
        const id = info.layer.id;
        let text = "";
        if (id === "routes") {
          const g = o as RouteGeo;
          text = `${g.o.id} → ${g.d.id} · ${g.route.weeklyFrequency}/wk · ${tierWord[g.route.tier]} · ${Math.round(g.km)} km`;
        } else if (id === "rival-routes") {
          const g = o as unknown as RivalMapEdge;
          text = `${g.a.id} ⇄ ${g.b.id} · ${g.carriers.join(", ")} · ${g.seats.toLocaleString()} seats/wk (competitor)`;
        } else if (id === "agg-routes") {
          const g = o as AggEdge;
          text = `${g.a.id} ⇄ ${g.b.id} corridor · ${g.routes} route${g.routes > 1 ? "s" : ""} · ${g.freq}/wk`;
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
        else if (id === "agg-routes") {
          const e = info.object as AggEdge;
          mapRef.current?.easeTo({ center: [(e.a.lon + e.b.lon) / 2, (e.a.lat + e.b.lat) / 2], zoom: Math.max(mapRef.current.getZoom(), 4.9), duration: 600 });
        }
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
      else map.jumpTo(fitCamera(map, "world", airportsRef.current, padRef.current));
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
        airports: model.airports, rank: model.rank, priority, project, width: c.clientWidth, height: c.clientHeight,
        spacing: showAllAirports ? 10 : markerSpacing(b), budget: showAllAirports ? Infinity : markerBudget(z),
      });
      const shown = model.airports.filter((a) => markers.has(a.id));
      setLod({ markers, labels: declutterLabels(shown, model.rank, b, project, c.clientWidth, c.clientHeight) });
    };
    run();
    map.on("moveend", run);
    return () => { map.off("moveend", run); };
  }, [ready, model, showAllAirports, selectedAirportId]);

  // Camera presets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || presetNonce === 0) return;
    map.flyTo({ ...fitCamera(map, preset, airportsRef.current, pad), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1800, essential: true });
  }, [presetNonce, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme restyle.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) applyStyleColors(map, colors);
  }, [colors, ready]);

  const staticLayers = useMemo(
    () => buildStaticLayers({ model, colors, band, selectedRoute: selectedRouteId, selectedAirport: selectedAirportId, dark: theme === "dark", labelIds: lod?.labels ?? null, markerIds: lod?.markers ?? null, allAirports: showAllAirports }),
    [model, colors, band, selectedRouteId, selectedAirportId, theme, lod, showAllAirports],
  );

  const rivalLayer = useMemo(() => {
    if (!rivalMarkets || rivalMarkets.length === 0) return null;
    return buildRivalLayer(buildRivalEdges(rivalMarkets, model.byId), colors);
  }, [rivalMarkets, model, colors]);

  useEffect(() => {
    if (!ready) return;
    const ghostLayers = ghost ? buildGhostLayers({ a: ghost.a && toDisplay(ghost.a), b: ghost.b && toDisplay(ghost.b) }, colors) : [];
    overlayRef.current?.setProps({ layers: [...(rivalLayer ? [rivalLayer] : []), ...staticLayers, ...ghostLayers, buildAircraftLayer(model, colors, band, simTime)] });
  }, [ready, staticLayers, rivalLayer, model, colors, band, simTime, ghost]);

  return (
    <>
      <div ref={el} className="map-root" />
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </>
  );
});
