import { useEffect, useRef } from "react";
import { useUi } from "../store";

const ROWS: Array<[string, string]> = [
  ["Space", "Pause / resume"],
  ["1 – 5", "Set game speed"],
  ["+ / −", "Faster / slower"],
  ["Ctrl/Cmd + K", "Command palette"],
  ["Alt + 1 – 8", "Switch view"],
  ["Ctrl/Cmd + S", "Quick save"],
  ["N", "New route (pauses the game)"],
  ["?", "This overlay"],
  ["Esc", "Close dialog"],
  ["Arrow keys", "Pan map"],
  ["PgUp / PgDn", "Zoom map"],
];

export function ShortcutsOverlay() {
  const setHelp = useUi((s) => s.setHelp);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setHelp(false); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="dialog-head"><h2>Keyboard shortcuts</h2><button ref={ref} className="icon-btn" aria-label="Close" onClick={() => setHelp(false)}>{"✕"}</button></div>
        <dl className="kbd-list">
          {ROWS.map(([k, d]) => (<div key={k}><dt>{k.split(" + ").map((p, i) => (<span key={i}>{i > 0 && " + "}<kbd>{p}</kbd></span>))}</dt><dd>{d}</dd></div>))}
        </dl>
      </div>
    </div>
  );
}
