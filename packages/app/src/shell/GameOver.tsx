import { dayToDate } from "@arg/sim";
import { formatDate, formatMoney } from "../sim/format";
import { useSim } from "../sim/useSim";
import { useUi } from "../store";
import { Modal } from "./Modal";

/** Bankruptcy: the sim has stopped. A summary of the failed airline, and the two ways on (load a save, start a new game). */
export function GameOver() {
  const sim = useSim();
  const setDialog = useUi((s) => s.setSaveDialog);
  const setStart = useUi((s) => s.setStartOpen);
  const credit = sim.credit;
  if (!credit?.bankrupt) return null;
  const aircraft = sim.fleet.filter((f) => f.status !== "delivery").length;
  const onOrder = sim.fleet.filter((f) => f.status === "delivery").length;
  return (
    <Modal label="Bankruptcy" scrimClassName="scrim" className="gameover-card" initialFocus="h1" closeOnEscape={false} closeOnBackdrop={false} onClose={() => undefined}>
      <h1 tabIndex={-1}>{sim.airline.name} is bankrupt</h1>
      <p>
        Cash stayed beyond the {formatMoney(credit.limitUsd)} credit line for 90 days. The lenders have called in the loans and the airline has ceased operations.
      </p>
      <dl className="mini" aria-label="Summary">
        <dt>Date</dt><dd>{formatDate(credit.bankrupt.day)} ({dayToDate(credit.bankrupt.day).year})</dd>
        <dt>Cash</dt><dd className="neg">{formatMoney(sim.cash)}</dd>
        <dt>Credit line</dt><dd>{formatMoney(credit.limitUsd)}</dd>
        <dt>Overdraft interest paid</dt><dd>{formatMoney(credit.interestPaidUsd)}</dd>
        <dt>Fleet</dt><dd>{aircraft} aircraft{onOrder > 0 ? `, ${onOrder} on order` : ""}</dd>
        <dt>Routes</dt><dd>{sim.routes.length}</dd>
      </dl>
      <div className="gameover-actions">
        <button className="primary" onClick={() => setDialog("load")}>Load a save</button>
        <button onClick={() => setStart(true)}>New game</button>
      </div>
    </Modal>
  );
}
