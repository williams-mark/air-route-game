import { formatMoney } from "../sim/format";
import { useSimSelector } from "../sim/useSim";
import { useUi } from "../store";

/**
 * Shown under the top bar while the airline is in financial distress (cash beyond the credit line). Says how long is left and
 * points at the cures: sell idle aircraft, close routes, cancel pending orders. Bankruptcy replaces it with the game-over card.
 */
export function DistressBanner() {
  const credit = useSimSelector((s) => s.credit);
  const cash = useSimSelector((s) => s.cash);
  const setView = useUi((s) => s.setView);
  if (!credit?.distress || credit.bankrupt) return null;
  const { daysLeft } = credit.distress;
  const beyond = Math.max(0, -cash - credit.limitUsd);
  return (
    <div className="distress-banner" role="alert" data-testid="distress-banner">
      <div className="db-text">
        <strong>Financial distress.</strong>{" "}
        Cash {formatMoney(cash)} is {formatMoney(beyond)} beyond your {formatMoney(credit.limitUsd)} credit line.
        {" "}<strong>{daysLeft} day{daysLeft === 1 ? "" : "s"} left</strong> to get back within it, or the airline goes bankrupt.
        {" "}Sell aircraft you own outright that fly no route (Fleet), close routes that lose money, or cancel pending aircraft orders (the deposit is forfeited).
      </div>
      <div className="db-actions">
        <button onClick={() => setView("fleet")}>Sell aircraft</button>
        <button onClick={() => setView("routes")}>Routes</button>
        <button onClick={() => setView("orders")}>Pending orders</button>
        <button onClick={() => setView("finance")}>Finance</button>
      </div>
    </div>
  );
}
