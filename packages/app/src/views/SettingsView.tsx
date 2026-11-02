import { UI_SCALES, useUi } from "../store";

export default function SettingsView() {
  const ui = useUi();
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
          <div><strong id="s-auto">Auto-pause on events</strong><p>Pause the game when a decision or an alert arrives.</p></div>
          <button role="switch" aria-checked={ui.autoPause} aria-labelledby="s-auto" className="switch" onClick={() => ui.setAutoPause(!ui.autoPause)}><span /></button>
        </div>
        <div className="setting">
          <div><strong id="s-scale">UI scale</strong><p>Size of text and controls in the shell.</p></div>
          <div className="seg" role="group" aria-labelledby="s-scale">
            {UI_SCALES.map((s) => (<button key={s} aria-pressed={ui.uiScale === s} onClick={() => ui.setUiScale(s)}>{s}%</button>))}
          </div>
        </div>
      </section>
      <p className="build-stamp" style={{ fontSize: 11, opacity: 0.6 }}>Build {__BUILD_SHA__} &middot; {__BUILD_DATE__}</p>
    </div>
  );
}
