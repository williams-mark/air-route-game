import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { bridge, bumpSpeed, setSpeed, togglePause, useSim } from "./sim/useSim";
import type { Speed } from "./sim/bridge";
import { useUi, type ViewId } from "./store";
import { TopBar } from "./shell/TopBar";
import { Toolbar } from "./shell/Toolbar";
import { EventFeed } from "./shell/EventFeed";
import { Decisions } from "./shell/Decisions";
import { OfferPopup } from "./offers/OfferPopup";
import { CommandPalette } from "./shell/CommandPalette";
import { ShortcutsOverlay } from "./shell/ShortcutsOverlay";
import { VIEWS } from "./shell/views";
import { MapView } from "./views/MapView";
import { RoutePanel, usePanelOpen } from "./routes/RoutePanel";
import { Toasts } from "./routes/Toasts";
import { useToasts } from "./routes/store";
import { useCreation } from "./routes/store";
import { SaveDialog, StartScreen, quickSave } from "./save/SaveUi";
import { installAutosave } from "./save/saves";
import "./routes/routes.css";

const LAZY: Partial<Record<ViewId, ReturnType<typeof lazy>>> = {
  routes: lazy(() => import("./views/RoutesView")),
  fleet: lazy(() => import("./views/FleetView")),
  planner: lazy(() => import("./views/PlannerView")),
  orders: lazy(() => import("./views/OrdersView")),
  cabin: lazy(() => import("./views/CabinView")),
  finance: lazy(() => import("./views/FinanceView")),
  rivals: lazy(() => import("./views/RivalsView")),
  settings: lazy(() => import("./views/SettingsView")),
};

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function useGlobalKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const st = useUi.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); st.setPalette(!st.paletteOpen); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!st.startOpen) void quickSave(); return; }
      if (st.startOpen) return;
      if (e.key === "Escape") {
        if (st.saveDialog) st.setSaveDialog(null);
        else if (st.paletteOpen) st.setPalette(false); else if (st.helpOpen) st.setHelp(false);
        return;
      }
      if (st.paletteOpen || st.helpOpen || st.saveDialog) return;
      if (isTyping(e.target)) return;
      if (e.altKey && /^[1-9]$/.test(e.key) && VIEWS[Number(e.key) - 1]) { st.setView(VIEWS[Number(e.key) - 1]!.id); e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); if (!e.repeat) togglePause(); }
      else if (/^[1-5]$/.test(e.key)) setSpeed(Number(e.key) as Speed);
      else if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") { e.preventDefault(); bumpSpeed(1); }
      else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") { e.preventDefault(); bumpSpeed(-1); }
      else if (e.key === "?") { st.setHelp(true); }
      else if (e.key === "n" || e.key === "N") { e.preventDefault(); useCreation.getState().begin(); }
    };
    // Stop a focused button from also being "clicked" when Space is used as the pause key.
    const up = (e: KeyboardEvent) => {
      const st = useUi.getState();
      if ((e.key === " " || e.code === "Space") && !isTyping(e.target) && !st.paletteOpen && !st.helpOpen && !st.saveDialog && !st.startOpen) e.preventDefault();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
}

/** Pause automatically when a new decision or alert arrives (if enabled in Settings). */
function useAutoPause() {
  const sim = useSim();
  // The real bridge slows and pauses its own clock (AutoSlowHook); this UI-side fallback serves the mock.
  const seen = useRef({ decisions: new Set(sim.decisions.map((d) => d.id)), notice: sim.notices[0]?.id ?? 0 });
  useEffect(() => {
    if (bridge.setAutoPause) return;
    let trigger = false;
    for (const d of sim.decisions) if (!seen.current.decisions.has(d.id)) { seen.current.decisions.add(d.id); trigger = true; useUi.getState().unsnoozeAll(); }
    for (const n of sim.notices) if (n.id > seen.current.notice) { if (n.severity === "alert") trigger = true; }
    seen.current.notice = Math.max(seen.current.notice, sim.notices[0]?.id ?? 0);
    if (trigger && useUi.getState().autoPause && bridge.getState().speed !== 0) setSpeed(0);
  }, [sim.decisions, sim.notices]);
}

function useAutosave() {
  useEffect(() => installAutosave(bridge, {
    blocked: () => useUi.getState().startOpen,
    onError: (m) => useToasts.getState().push("info", `Autosave failed: ${m}`),
  }), []);
}

export function Shell() {
  const view = useUi((s) => s.view);
  const palette = useUi((s) => s.paletteOpen);
  const help = useUi((s) => s.helpOpen);
  const panel = usePanelOpen();
  useGlobalKeys();
  useAutoPause();
  useAutosave();
  const startOpen = useUi((s) => s.startOpen);
  const saveDialog = useUi((s) => s.saveDialog);
  const Lazy = LAZY[view];
  let page: ReactNode = null;
  if (Lazy) page = (<main className="view" id="main" aria-label={VIEWS.find((v) => v.id === view)?.label}><Suspense fallback={<div className="page"><p>Loading{"…"}</p></div>}><Lazy /></Suspense></main>);
  return (
    <div className="shell">
      <TopBar />
      <Toolbar />
      <div className={`main ${view === "map" ? "on-map" : ""} ${panel ? "has-panel" : ""}`}>
        <MapView />
        {page}
        {view === "map" && <div className="overlay-left"><EventFeed /></div>}
        <div className="overlay-right"><OfferPopup /><Decisions /></div>
        <RoutePanel />
      </div>
      <Toasts />
      {palette && <CommandPalette />}
      {help && <ShortcutsOverlay />}
      {saveDialog && <SaveDialog />}
      {startOpen && <StartScreen />}
    </div>
  );
}
