import type { Decision } from "../sim/bridge";

export function DecisionCard({ decision, index, total, onChoose, onLater }: {
  decision: Decision; index: number; total: number; onChoose: (optionId: string) => void; onLater: () => void;
}) {
  const titleId = `dc-${decision.id}`;
  return (
    <section className="decision" role="group" aria-labelledby={titleId}>
      <div className="decision-kicker">Decision{total > 1 ? ` ${index + 1} of ${total}` : ""}</div>
      <h3 id={titleId}>{decision.title}</h3>
      <p>{decision.context}</p>
      <div className="decision-options">
        {decision.options.map((o) => (
          <button key={o.id} className="opt" onClick={() => onChoose(o.id)}>
            <span className="opt-label">{o.label}</span>
            <span className="opt-effect">{o.effect}</span>
          </button>
        ))}
      </div>
      <button className="link-btn" onClick={onLater}>Decide later</button>
    </section>
  );
}
