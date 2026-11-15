import { useEffect, useState } from "react";
import { UI_SCALES, useUi } from "../store";
import { getPlatform } from "../platform";
import { bridge } from "../sim/useSim";
import { saveToSlot } from "../save/saves";
import { useToasts } from "../routes/store";
import { useDock } from "../notify/dockStore";
import { CORNERS } from "../notify/dockLogic";
import { AchievementsList } from "../achievements/AchievementsList";

/** Desktop-only rows: fullscreen and quit. Rendered only when the platform is the Electron app. */
function DesktopSettings() {
  const platform = getPlatform();
  const [full, setFull] = useState(false);
  const [quitting, setQuitting] = useState(false);
  useEffect(() => { void platform.fullscreen.get().then(setFull).catch(() => undefined); }, [platform]);
  const toggle = async () => {
    const next = !full;
    setFull(next);
    try { await platform.fullscreen.set(next); } catch { setFull(!next); }
  };
  const quit = async () => {
    setQuitting(true);
    // Same rules as the autosave hook: no autosave from the start screen, after bankruptcy or during the campaign review.
    const s = bridge.getState();
    if (!useUi.getState().startOpen && !s.credit?.bankrupt && !s.review) {
      const o = await saveToSlot(bridge, "auto");
      if (!o.ok) useToasts.getState().push("info", `Autosave failed: ${o.message}`);
    }
    await platform.quit();
    setQuitting(false);
  };
  return (
    <>
      <div className="setting">
        <div><strong id="s-full">Fullscreen</strong><p>Fill the whole screen.</p></div>
        <button type="button" role="switch" className="switch" aria-checked={full} aria-labelledby="s-full" onClick={toggle}><span /></button>
      </div>
      <div className="setting">
        <div><strong>Quit to desktop</strong><p>Autosaves, then closes the game.</p></div>
        <button disabled={quitting} onClick={quit}>Quit to desktop</button>
      </div>
    </>
  );
}

export default function SettingsView() {
  const ui = useUi();
  const dock = useDock();
  const desktop = getPlatform().kind === "desktop";
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Settings</h1><p>{desktop ? "Saved on this computer." : "Saved in this browser."}</p></header>
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
        {desktop && <DesktopSettings />}
      </section>
      <AchievementsList />
      <p className="build-stamp" style={{ fontSize: 11, opacity: 0.6 }}>Build {__BUILD_SHA__} &middot; {__BUILD_DATE__}</p>
    </div>
  );
}
