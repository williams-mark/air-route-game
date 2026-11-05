import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { bridge, bumpSpeed, setSpeed, togglePause } from "./sim/useSim";
import type { Speed } from "./sim/bridge";
import { useUi, type ViewId } from "./store";
import { TopBar } from "./shell/TopBar";
import { Toolbar } from "./shell/Toolbar";
import { useDock } from "./notify/dockStore";
import { NotificationDock, minimizeDock, toggleDock } from "./notify/NotificationDock";
import { TimeControls } from "./shell/TimeControls";
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

const dockCollapsed = () => {
  const d = useDock.getState();
  return useUi.getState().view === "map" ? d.minimized : !d.peek;
};

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
        else if (!dockCollapsed()) minimizeDock();
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
      else if (e.key === "j" || e.key === "J") { e.preventDefault(); toggleDock(); }
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
        <RoutePanel />
        <TimeControls />
      </div>
      <NotificationDock />
      <Toasts />
      {palette && <CommandPalette />}
      {help && <ShortcutsOverlay />}
      {saveDialog && <SaveDialog />}
      {startOpen && <StartScreen />}
    </div>
  );
}
