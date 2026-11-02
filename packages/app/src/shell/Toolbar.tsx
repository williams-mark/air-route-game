import { useUi } from "../store";
import { VIEWS } from "./views";

export function Toolbar() {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  return (
    <nav className="toolbar" aria-label="Main views">
      {VIEWS.map(({ id, label, Icon }, i) => (
        <button
          key={id} className="tool-btn" aria-label={label} aria-current={view === id ? "page" : undefined}
          title={`${label} (Alt+${i + 1})`} onClick={() => setView(id)}
        >
          <Icon size={22} />
          <span className="tool-label">{label.split(" ")[0]}</span>
        </button>
      ))}
    </nav>
  );
}
