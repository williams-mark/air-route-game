import { bridge, useSimSelector } from "../sim/useSim";
import { useUi } from "../store";
import { DecisionCard } from "./DecisionCard";

/** Shows the first non-snoozed pending decision in a corner; never covers the whole map. */
export function Decisions() {
  const decisions = useSimSelector((s) => s.decisions);
  const snoozed = useUi((s) => s.snoozed);
  const snooze = useUi((s) => s.snooze);
  const visible = decisions.filter((d) => !snoozed.includes(d.id));
  const d = visible[0];
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  if (!d) return null;
  if (view !== "map") {
    return (
      <button className="decision-compact" onClick={() => setView("map")}>
        <span className="decision-kicker">Decision{visible.length > 1 ? `s (${visible.length})` : ""}</span>
        <strong>{d.title}</strong>
        <span className="opt-effect">Open on map</span>
      </button>
    );
  }
  return <DecisionCard decision={d} index={0} total={visible.length} onChoose={(o) => bridge.decide(d.id, o)} onLater={() => snooze(d.id)} />;
}
