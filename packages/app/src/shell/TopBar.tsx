import { useSim, setSpeed, togglePause } from "../sim/useSim";
import { formatDay, formatMoney } from "../sim/format";
import type { Speed } from "../sim/bridge";
import { useUi } from "../store";
import { IconKeyboard, IconMoon, IconPause, IconPlay, IconSearch, IconSun, IconBell } from "./icons";
import { Sparkline } from "./Sparkline";

export function TopBar() {
  const sim = useSim();
  const ui = useUi();
  const paused = sim.speed === 0;
  const pending = sim.decisions.length;
  return (
    <header className="topbar">
      <div className="brand" title="Hub: LAX">
        <strong>{sim.airline.name}</strong>
        <span className="chip">Hub {sim.airline.hub}</span>
      </div>

      <div className="stats" role="group" aria-label="Company status">
        <div className="stat"><span className="k">Date</span><span className="v" aria-live="off">{formatDay(sim.day)}</span></div>
        <div className="stat"><span className="k">Cash</span><span className="v">{formatMoney(sim.cash)}</span></div>
        <div className="stat">
          <span className="k">Profit, 30 days</span>
          <span className={`v ${sim.profit30 >= 0 ? "pos" : "neg"}`}>
            {formatMoney(sim.profit30, { sign: true })}
            <Sparkline values={sim.profitSeries} label="Daily profit over the last 30 days" />
          </span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="speed" role="group" aria-label="Game speed">
          <button className="icon-btn" aria-label={paused ? "Resume" : "Pause"} aria-pressed={paused} title="Pause / resume (Space)" onClick={togglePause}>
            {paused ? <IconPlay size={18} /> : <IconPause size={18} />}
          </button>
          {([1, 2, 3, 4, 5] as Speed[]).map((s) => (
            <button key={s} className="speed-btn" aria-label={`Speed ${s}`} aria-pressed={sim.speed === s} title={`Speed ${s} (key ${s})`} onClick={() => setSpeed(s)}>{s}</button>
          ))}
        </div>
        {pending > 0 && (
          <button className="pill-btn" aria-label={`${pending} pending decisions. Show`} onClick={() => { ui.unsnoozeAll(); }}>
            <IconBell size={16} /> {pending}
          </button>
        )}
        <button className="icon-btn" aria-label="Open command palette" title="Command palette (Ctrl/Cmd+K)" onClick={() => ui.setPalette(true)}><IconSearch size={18} /></button>
        <button className="icon-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => ui.setHelp(true)}><IconKeyboard size={18} /></button>
        <button className="icon-btn" aria-label={`Switch to ${ui.theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme" onClick={() => ui.setTheme(ui.theme === "dark" ? "light" : "dark")}>
          {ui.theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>
      </div>
    </header>
  );
}
