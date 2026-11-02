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
  const ref = useRef<HTMLElement>(null);
  if (!creating && !route) return null;
  return (
    <aside
      ref={ref} className={`route-panel ${creating ? "sandbox" : ""}`} role="complementary" aria-labelledby="rp-title"
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
