import { Modal } from "../shell/Modal";
import { formatMoney } from "../sim/format";
import type { DisposePlan } from "./disposePlan";

interface Props {
  plan: DisposePlan;
  /** The airline is in financial distress: say that this is a cure. */
  distress: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirm a sale or lease return: what each aircraft brings or costs, what is refused and why, and the effect on cash, the credit line and the fleet mix. */
export function DisposeDialog({ plan, distress, onConfirm, onClose }: Props) {
  const sell = plan.action === "sell";
  const noun = "aircraft";
  const title = sell ? (plan.lines.length === 1 ? `Sell ${plan.lines[0]!.tail}` : `Sell ${plan.lines.length} aircraft`) : (plan.lines.length === 1 ? `Return ${plan.lines[0]!.tail}` : `Return ${plan.lines.length} leased aircraft`);
  const refused = plan.lines.filter((l) => !l.ok);
  const confirmLabel = plan.count === 0 ? (sell ? "Sell" : "Return")
    : sell ? `Sell ${plan.count} ${noun} for ${formatMoney(plan.proceedsUsd)}` : `Return ${plan.count} ${noun}, pay ${formatMoney(plan.feeUsd)}`;
  return (
    <Modal label={title} className="dialog dispose-dialog" onClose={onClose}>
      <div className="dialog-head"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close">Close</button></div>
      <div className="dialog-body dispose-body">
        <p className="hint" style={{ margin: 0 }}>
          {sell
            ? "A dealer pays the depreciated value of the aircraft (less a market discount) at once. The airline stops paying overhead for it, but the credit line loses the aircraft as collateral."
            : "Returning a lease early costs a termination fee of a few months of lease payments, paid now. The lease payment and overhead for the aircraft then stop."}
        </p>
        <ul className="dispose-lines" aria-label={sell ? "Aircraft to sell" : "Aircraft to return"}>
          {plan.lines.map((l) => (
            <li key={l.id} className={l.ok ? undefined : "refused"}>
              <span className="dl-tail">{l.tail}{l.typeId ? <span className="hint"> {l.typeId}</span> : null}</span>
              {l.ok
                ? <span className={`dl-amt ${sell ? "pos" : "neg"}`}>{sell ? `+${formatMoney(l.amountUsd)}` : `−${formatMoney(l.amountUsd)}`}</span>
                : <span className="dl-why neg">{l.reason}</span>}
            </li>
          ))}
        </ul>
        {plan.count > 0 && (
          <dl className="credit-grid dispose-totals">
            <div><dt>{sell ? "Proceeds" : "Termination fee"}</dt><dd className={sell ? "pos" : "neg"}>{sell ? formatMoney(plan.proceedsUsd) : formatMoney(plan.feeUsd)}</dd></div>
            <div><dt>Cash after</dt><dd className={plan.cashAfterUsd < 0 ? "neg" : ""}>{formatMoney(plan.cashAfterUsd)}</dd></div>
            {sell && <div><dt>Credit line</dt><dd>{formatMoney(plan.creditLimitBeforeUsd)} → {formatMoney(plan.creditLimitAfterUsd)}</dd></div>}
            <div><dt>{sell ? "Overhead saved" : "Lease and overhead saved"}</dt><dd>{formatMoney(plan.monthlySavingUsd)} a month</dd></div>
            {plan.typesAfter !== plan.typesBefore && <div><dt>Aircraft types</dt><dd>{plan.typesBefore} → {plan.typesAfter}{plan.diversitySavingMonthlyUsd > 0 ? `, saves ${formatMoney(plan.diversitySavingMonthlyUsd)} a month in type overhead` : ""}</dd></div>}
          </dl>
        )}
        {distress && sell && plan.count > 0 && <p className="credit-status" role="status">Selling is one way out of financial distress: the proceeds go straight into cash.</p>}
        {refused.length > 0 && plan.count === 0 && <p className="hint" style={{ margin: 0 }}>Nothing here can be {sell ? "sold" : "returned"} yet.</p>}
      </div>
      <div className="dialog-foot">
        <span />
        <div>
          <button type="button" onClick={onClose}>Cancel</button>{" "}
          <button type="button" className="primary" disabled={plan.count === 0} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
