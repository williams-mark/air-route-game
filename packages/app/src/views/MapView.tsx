import { useEffect, useMemo, useRef, useState } from "react";
import { AirMap, type AirMapHandle } from "../map/AirMap";
import type { MapRoute } from "../map/types";
import { uiAirports } from "../dev/airportSource";
import { stressRoutes } from "../dev/fixtures";
import { useCreation } from "../routes/store";
import { toMapRoutes, useRouteSummaries } from "../routes/useRoutes";
import { useUi } from "../store";
import { bridge, useSimSelector } from "../sim/useSim";
import { basesOf, homeHubOf } from "@arg/sim";

const SIM_MIN_PER_SEC = 20;
const TIER_VAR = { profit: "--route-profit", marginal: "--route-marginal", loss: "--route-loss", planned: "--route-planned" } as const;

export function MapView() {
  const ui = useUi();
  const speed = useSimSelector((s) => s.speed);
  const active = ui.view === "map";
  const mapRef = useRef<AirMapHandle>(null);
  const [simTime, setSimTime] = useState(() => {
    const t = Number(new URLSearchParams(location.search).get("t"));
    return Number.isFinite(t) ? t : 0;
  });

  const airports = uiAirports;
  const summaries = useRouteSummaries();
  const rivalMarkets = useSimSelector((st) => st.rivals.markets);
  const creation = useCreation();
  const routes: MapRoute[] = useMemo(() => {
    const stress = Number(new URLSearchParams(location.search).get("stress"));
    if (stress > 0) return stressRoutes(airports, stress);
    const ids = new Set(airports.map((a) => a.id));
    return toMapRoutes(summaries).filter((r) => ids.has(r.origin) && ids.has(r.destination));
  }, [airports, summaries]);
  const ghost = useMemo(
    () => (creation.open ? { a: airports.find((a) => a.id === creation.origin) ?? null, b: airports.find((a) => a.id === creation.destination) ?? null } : null),
    [creation.open, creation.origin, creation.destination, airports],
  );

  // Map aircraft clock: advances only while the game runs and the map is visible.
  useEffect(() => {
    if (speed === 0 || !active) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      setSimTime((t) => t + ((now - last) / 1000) * SIM_MIN_PER_SEC * speed);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, active]);

  const sel = ui.selection;
  const selRoute = sel?.kind === "route" ? routes.find((r) => r.id === sel.id) : undefined;
  const padding = useMemo(() => ({ top: 70, left: 70, right: window.innerWidth > 900 ? 360 : 40, bottom: 210 }), []);
  const dot = (tier: keyof typeof TIER_VAR) => ({ background: `var(${TIER_VAR[tier]})` });
  // Clicking a city opens a new route there (owner, 22 Nov 2026; the airport information panel is gone). One of the player's hubs
  // or outstations becomes the origin; any other city becomes the destination from the home hub. With the creator open, a click
  // fills the end being picked, as before.
  const openRouteAt = (id: string) => {
    if (creation.open) { creation.assign(id); return; }
    const sim = bridge.getSim?.() ?? null;
    const home = sim ? homeHubOf(sim) : bridge.getState().airline.hub;
    const bases = sim ? basesOf(sim) : [home];
    if (bases.includes(id)) { creation.begin(id); return; }
    creation.begin(home);
    useCreation.getState().assign(id, "destination");
  };

  return (
    <div className="map-view">
      <AirMap
        ref={mapRef} airports={airports} routes={routes} simTime={simTime} theme={ui.theme}
        preset={ui.preset} presetNonce={ui.presetNonce} padding={padding}
        selectedRouteId={selRoute?.id ?? null} selectedAirportId={null}
        rivalMarkets={ui.showCompetitors ? rivalMarkets : undefined}
        ghost={ghost} showAllAirports={creation.open}
        onSelectRoute={(id) => { if (!creation.open) ui.select({ kind: "route", id }); }}
        onSelectAirport={openRouteAt}
      />

      <div className="map-tools">
        <button className="hud-btn" onClick={() => creation.begin()} title="New route (N)" aria-keyshortcuts="N">+ New route</button>
        <button className="hud-btn" aria-pressed={ui.showCompetitors} onClick={() => ui.setShowCompetitors(!ui.showCompetitors)} title="Draw competitor routes on the map">
          <i className="rival-swatch" aria-hidden="true" />Show competitors
        </button>
        <div className="hud legend">
          {(["profit", "marginal", "loss", "planned"] as const).map((t) => (
            <span key={t}><i style={dot(t)} />{t === "profit" ? "Profit" : t === "marginal" ? "Marginal" : t === "loss" ? "Loss" : "Planned"}</span>
          ))}
        </div>
      </div>
      <div className="hud zoom">
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomBy(0.8)}>+</button>
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomBy(-0.8)}>{"−"}</button>
      </div>

      <div className="credit">Geometry: US Census (us-atlas) and Natural Earth (world-atlas). Demo data, not final.</div>
    </div>
  );
}
