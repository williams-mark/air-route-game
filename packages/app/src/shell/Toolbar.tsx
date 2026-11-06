import { useUi } from "../store";
import { VIEWS, viewShortcut } from "./views";

export function Toolbar() {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  return (
    <nav className="toolbar" aria-label="Main views">
      {VIEWS.map((v) => (
        <button
          key={v.id} className="tool-btn" aria-label={v.label} aria-current={view === v.id ? "page" : undefined}
          title={`${v.label} (${viewShortcut(v)})`} onClick={() => setView(v.id)}
        >
          <v.Icon size={22} />
          <span className="tool-label">{v.label.split(" ")[0]}</span>
        </button>
      ))}
    </nav>
  );
}
