import { useEffect, useMemo, useRef, useState } from "react";
import { airports as dataAirports } from "@arg/data";
import { AirMap, type AirMapHandle } from "../map/AirMap";
import { PRESET_LABEL } from "../map/presets";
import type { CameraPresetId, MapRoute } from "../map/types";
import { DEV_MIN_AIRPORTS, fixtureAirports, fixtureRoutes, stressRoutes } from "../dev/fixtures";
import { useUi } from "../store";
import { useSim } from "../sim/useSim";

const SIM_MIN_PER_SEC = 20;
const TIER_VAR = { profit: "--route-profit", marginal: "--route-marginal", loss: "--route-loss", planned: "--route-planned" } as const;

export function MapView() {
  const ui = useUi();
  const { speed } = useSim();
  const active = ui.view === "map";
  const mapRef = useRef<AirMapHandle>(null);
  const [simTime, setSimTime] = useState(() => {
    const t = Number(new URLSearchParams(location.search).get("t"));
    return Number.isFinite(t) ? t : 0;
  });

  const airports = dataAirports.length >= DEV_MIN_AIRPORTS ? dataAirports : fixtureAirports;
  const routes: MapRoute[] = useMemo(() => {
    const stress = Number(new URLSearchParams(location.search).get("stress"));
    if (stress > 0) return stressRoutes(airports, stress);
    const ids = new Set(airports.map((a) => a.id));
    return fixtureRoutes.filter((r) => ids.has(r.origin) && ids.has(r.destination));
  }, [airports]);

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
  const selAirport = sel?.kind === "airport" ? airports.find((a) => a.id === sel.id) : undefined;
  const padding = useMemo(() => ({ top: 70, left: 70, right: window.innerWidth > 900 ? 360 : 40, bottom: 210 }), []);
  const dot = (tier: keyof typeof TIER_VAR) => ({ background: `var(${TIER_VAR[tier]})` });

  return (
    <div className="map-view">
      <AirMap
        ref={mapRef} airports={airports} routes={routes} simTime={simTime} theme={ui.theme}
        preset={ui.preset} presetNonce={ui.presetNonce} padding={padding}
        selectedRouteId={selRoute?.id ?? null} selectedAirportId={selAirport?.id ?? null}
        onSelectRoute={(id) => ui.select({ kind: "route", id })} onSelectAirport={(id) => ui.select({ kind: "airport", id })}
      />

      <div className="map-tools">
        <div className="hud seg" role="group" aria-label="Camera presets">
          {(["california", "hawaii", "both"] as CameraPresetId[]).map((p) => (
            <button key={p} aria-pressed={ui.preset === p && ui.presetNonce > 0} onClick={() => ui.flyTo(p)}>{PRESET_LABEL[p]}</button>
          ))}
        </div>
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

      <aside className="hud side" aria-label="Selection details">
        {selRoute ? (
          <>
            <h2>Route</h2>
            <div className="big">{selRoute.origin} {"→"} {selRoute.destination}</div>
            <div><span className="dot" style={dot(selRoute.tier)} />{selRoute.tier}</div>
            <dl>
              <dt>Weekly frequency</dt><dd>{selRoute.weeklyFrequency}</dd>
              <dt>Economy fare</dt><dd>${selRoute.fares.Y}</dd>
              <dt>Aircraft</dt><dd>{selRoute.typeId}</dd>
              {selRoute.weeklyProfitUsd != null && (<><dt>Weekly profit</dt><dd>{selRoute.weeklyProfitUsd < 0 ? "−" : ""}${Math.abs(selRoute.weeklyProfitUsd).toLocaleString()}</dd></>)}
            </dl>
            <button onClick={() => ui.select(null)}>Clear</button>
          </>
        ) : selAirport ? (
          <>
            <h2>Airport</h2>
            <div className="big">{selAirport.id}</div>
            <div>{selAirport.name}</div>
            <dl>
              <dt>City</dt><dd>{selAirport.city}</dd>
              <dt>Region</dt><dd>{selAirport.region}</dd>
              <dt>Longest runway</dt><dd>{selAirport.runwayM.toLocaleString()} m</dd>
              <dt>Metro population</dt><dd>{selAirport.metroPopulation.toLocaleString()}</dd>
              <dt>Slots / hour</dt><dd>{selAirport.slotsPerHour}</dd>
              <dt>Routes served</dt><dd>{routes.filter((r) => r.origin === selAirport.id || r.destination === selAirport.id).length}</dd>
            </dl>
            <button onClick={() => ui.select(null)}>Clear</button>
          </>
        ) : (
          <>
            <h2>Network</h2>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-dim)" }}>
              {airports.length} airports, {routes.length} routes. Click a route or airport on the map, or pick one below.
            </p>
            <ul className="list">
              {routes.slice(0, 60).map((r) => (
                <li key={r.id}>
                  <button className="row-btn" onClick={() => ui.select({ kind: "route", id: r.id })}>
                    <span><span className="dot" style={dot(r.tier)} />{r.origin} {"→"} {r.destination}</span><span>{r.weeklyFrequency}/wk</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <div className="credit">Geometry: US Census via us-atlas. Demo data, not final.</div>
    </div>
  );
}
