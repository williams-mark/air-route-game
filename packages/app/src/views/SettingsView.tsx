import { UI_SCALES, useUi } from "../store";
import { useDock } from "../notify/dockStore";
import { CORNERS } from "../notify/dockLogic";

export default function SettingsView() {
  const ui = useUi();
  const dock = useDock();
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Settings</h1><p>Saved in this browser.</p></header>
      <section className="panel-box">
        <div className="setting">
          <div><strong id="s-theme">Theme</strong><p>Light or dark interface and map.</p></div>
          <div className="seg" role="group" aria-labelledby="s-theme">
            {(["dark", "light"] as const).map((t) => (<button key={t} aria-pressed={ui.theme === t} onClick={() => ui.setTheme(t)}>{t === "dark" ? "Dark" : "Light"}</button>))}
          </div>
        </div>
        <div className="setting">
          <div><strong id="s-scale">UI scale</strong><p>Size of text and controls in the shell.</p></div>
          <div className="seg" role="group" aria-labelledby="s-scale">
            {UI_SCALES.map((s) => (<button key={s} aria-pressed={ui.uiScale === s} onClick={() => ui.setUiScale(s)}>{s}%</button>))}
          </div>
        </div>
        <div className="setting">
          <div><strong id="s-dock">Notification panel</strong><p>Corner for decisions, offers and notices. Drag its handle on the map to place it anywhere; J shows or minimizes it.</p></div>
          <div className="dock-settings">
            <div className="seg" role="group" aria-labelledby="s-dock">
              {CORNERS.map((c) => (<button key={c} aria-pressed={dock.corner === c && !dock.pos} onClick={() => dock.setCorner(c)}>{c.replace("-", " ").replace(/^./, (x) => x.toUpperCase())}</button>))}
            </div>
            <button onClick={dock.resetPosition}>Reset position</button>
          </div>
        </div>
        <div className="setting">
          <div><strong>Saved games</strong><p>Five slots plus an autosave, stored in this browser. Export a file to keep a backup.</p></div>
          <div className="seg">
            <button onClick={() => ui.setSaveDialog("save")}>Save…</button>
            <button onClick={() => ui.setSaveDialog("load")}>Load…</button>
          </div>
        </div>
      </section>
      <p className="build-stamp" style={{ fontSize: 11, opacity: 0.6 }}>Build {__BUILD_SHA__} &middot; {__BUILD_DATE__}</p>
    </div>
  );
}
