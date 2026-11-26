import { useUi } from "../store";
import { bridge, useSim } from "../sim/useSim";
import { VIEWS, viewShortcut } from "./views";

export function Toolbar() {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  useSim();
  // A takeover offer waiting for an answer marks the Markets button.
  const offers = bridge.getSim?.()?.market?.incoming.length ?? 0;
  return (
    <nav className="toolbar" aria-label="Main views">
      {VIEWS.map((v) => (
        <button
          key={v.id} className={`tool-btn${v.id === "markets" && offers > 0 ? " has-badge" : ""}`} aria-label={v.id === "markets" && offers > 0 ? `${v.label} (takeover offer waiting)` : v.label} aria-current={view === v.id ? "page" : undefined}
          title={`${v.label} (${viewShortcut(v)})`} onClick={() => setView(v.id)}
        >
          <v.Icon size={22} />
          <span className="tool-label">{v.label.split(" ")[0]}</span>
        </button>
      ))}
    </nav>
  );
}
