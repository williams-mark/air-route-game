import { ACHIEVEMENTS } from "./definitions";
import { useAchievements } from "./store";
import "./achievements.css";

/** Settings section: every achievement with its earned state. */
export function AchievementsList() {
  const unlocked = useAchievements((s) => s.unlocked);
  const enabled = useAchievements((s) => s.enabled);
  const have = new Set(unlocked);
  const count = ACHIEVEMENTS.filter((a) => have.has(a.id)).length;
  return (
    <section className="panel-box" aria-labelledby="ach-h">
      <h2 id="ach-h">Achievements ({count} of {ACHIEVEMENTS.length})</h2>
      {!enabled && <p className="ach-note">Achievements are not counted in demo and mock games.</p>}
      <ul className="ach-list">
        {ACHIEVEMENTS.map((a) => {
          const done = have.has(a.id);
          return (
            <li key={a.id} className={done ? "ach ach-done" : "ach"}>
              <span className="ach-mark" aria-hidden="true">{done ? "✓" : ""}</span>
              <div>
                <strong>{a.name}</strong>
                <p>{a.description}</p>
              </div>
              <span className="ach-state">{done ? "Earned" : "Not earned"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
