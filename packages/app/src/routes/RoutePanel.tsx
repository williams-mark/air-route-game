import { useRef } from "react";
import { useUi } from "../store";
import { useSimSelector } from "../sim/useSim";
import { RouteCreator } from "./RouteCreator";
import { RouteInspector } from "./RouteInspector";
import { useCreation } from "./store";

/** The route (if any) shown in the inspector. */
export function useInspectedRoute() {
  const sel = useUi((s) => s.selection);
  const routes = useSimSelector((s) => s.routes);
  return sel?.kind === "route" ? routes.find((r) => r.id === sel.id) : undefined;
}
/** True while the creation sandbox is only asking for the two airports: the panel is then a small card and the map keeps its full width. */
export function usePanelCompact(): boolean {
  return useCreation((s) => s.open && (!s.origin || !s.destination));
}
export function usePanelOpen(): boolean {
  const creating = useCreation((s) => s.open);
  const route = useInspectedRoute();
  return creating || !!route;
}

/** Right-side panel hosting the route inspector or the route-creation sandbox. */
export function RoutePanel() {
  const creating = useCreation((s) => s.open);
  const route = useInspectedRoute();
  const select = useUi((s) => s.select);
  const end = useCreation((s) => s.end);
  const picking = useCreation((s) => !s.origin || !s.destination);
  const ref = useRef<HTMLElement>(null);
  if (!creating && !route) return null;
  return (
    <aside
      ref={ref} className={`route-panel ${creating ? "sandbox" : ""} ${creating && picking ? "picking" : ""}`} role="complementary" aria-labelledby="rp-title"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.stopPropagation();
        if (creating) end(); else select(null);
      }}
    >
      {creating ? <RouteCreator /> : route ? <RouteInspector key={route.id} route={route} /> : null}
    </aside>
  );
}
