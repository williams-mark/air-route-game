import { useUi } from "../store";
import { Modal } from "./Modal";

const ROWS: Array<[string, string]> = [
  ["Space", "Pause / resume"],
  ["1 – 5", "Set game speed"],
  ["+ / −", "Faster / slower"],
  ["Ctrl/Cmd + K", "Command palette"],
  ["Alt + 1 – 9, 0", "Switch view"],
  ["Ctrl/Cmd + S", "Quick save"],
  ["N", "New route (pauses the game)"],
  ["J", "Show / minimize notifications"],
  ["?", "This overlay"],
  ["Esc", "Close dialog; minimize notifications"],
  ["Arrow keys", "Pan map"],
  ["PgUp / PgDn", "Zoom map"],
];

export function ShortcutsOverlay() {
  const setHelp = useUi((s) => s.setHelp);
  return (
    <Modal label="Keyboard shortcuts" onClose={() => setHelp(false)}>
        <div className="dialog-head"><h2>Keyboard shortcuts</h2><button className="icon-btn" aria-label="Close" onClick={() => setHelp(false)}>{"✕"}</button></div>
        <dl className="kbd-list">
          {ROWS.map(([k, d]) => (<div key={k}><dt>{k.split(" + ").map((p, i) => (<span key={i}>{i > 0 && " + "}<kbd>{p}</kbd></span>))}</dt><dd>{d}</dd></div>))}
        </dl>
    </Modal>
  );
}
