import { useSim, setSpeed, togglePause } from "../sim/useSim";
import { formatDay } from "../sim/format";
import type { Speed } from "../sim/bridge";
import { IconPause, IconPlay } from "./icons";

/** Floating pill at the bottom-right of the main area: pause, speeds 1-5 and the date. Sits left of the map side panel / route panel. */
export function TimeControls() {
  const sim = useSim();
  const paused = sim.speed === 0;
  return (
    <div className="time-pill" role="group" aria-label="Time controls">
      <span className="tp-date" aria-hidden="true">{formatDay(sim.day)}</span>
      <div className="speed" role="group" aria-label="Game speed">
        <button className="icon-btn" aria-label={paused ? "Resume" : "Pause"} aria-pressed={paused} title="Pause / resume (Space)" onClick={togglePause}>
          {paused ? <IconPlay size={18} /> : <IconPause size={18} />}
        </button>
        {([1, 2, 3, 4, 5] as Speed[]).map((s) => (
          <button key={s} className="speed-btn" aria-label={`Speed ${s}`} aria-pressed={sim.speed === s} title={`Speed ${s} (key ${s})`} onClick={() => setSpeed(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}
