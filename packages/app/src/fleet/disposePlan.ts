// Planning a sale or lease return for one or several aircraft: runs the sim's own quote and command on a scratch copy, one aircraft
// after the other, so the totals (and the credit line left over) are exactly what the commands will do.
import { applyCommand, creditLimitUsd, diversityOf, type DisposalAction, type SimState } from "@arg/sim";
import type { FleetItem } from "../sim/bridge";

/** What can be done with the aircraft: sell it (owned outright) or return it (leased), and why not right now. Null action = unknown (mock data). */
export function disposeOptions(a: FleetItem): { action: DisposalAction; blocker: string | null } | null {
  if (!a.holding) return null;
  const action: DisposalAction = a.holding === "purchase" ? "sell" : "return";
  const verb = action === "sell" ? "sell" : "return";
  if (a.status === "delivery") return { action, blocker: "Not delivered yet: cancel the order under Orders instead" };
  if (a.status === "maintenance") return { action, blocker: "In the hangar: wait until it is back in service" };
  if (a.routes.length > 0) return { action, blocker: `Flies ${a.routes.join(", ")}: take it off its routes first, then ${verb} it` };
  return { action, blocker: null };
}


export interface DisposeLine {
  id: string;
  tail: string;
  typeId: string;
  ok: boolean;
  /** Sale: proceeds. Return: fee (positive number). 0 when refused. */
  amountUsd: number;
  /** Why it cannot be done (sim's wording) when `ok` is false. */
  reason?: string;
}

export interface DisposePlan {
  action: DisposalAction;
  lines: DisposeLine[];
  /** Aircraft that will go. */
  count: number;
  proceedsUsd: number;
  feeUsd: number;
  /** Net cash change. */
  netUsd: number;
  cashAfterUsd: number;
  creditLimitBeforeUsd: number;
  creditLimitAfterUsd: number;
  /** Lease payment and overhead that stop, per month (returns) or overhead only (sales). */
  monthlySavingUsd: number;
  /** Aircraft types in service before and after, and the commonality overhead per month saved. */
  typesBefore: number;
  typesAfter: number;
  diversitySavingMonthlyUsd: number;
}

export function planDisposal(sim: SimState, items: readonly Pick<FleetItem, "id">[], action: DisposalAction): DisposePlan {
  const lines: DisposeLine[] = [];
  let s = sim;
  let proceeds = 0, fee = 0, saving = 0;
  for (const it of items) {
    const ac = s.world.fleet.find((a) => a.id === it.id);
    const cmd = action === "sell" ? ({ kind: "sellAircraft", aircraftId: it.id } as const) : ({ kind: "returnLease", aircraftId: it.id } as const);
    const { state, result } = applyCommand(s, cmd);
    if (!result.ok) {
      lines.push({ id: it.id, tail: ac?.tailNumber ?? it.id, typeId: ac?.typeId ?? "", ok: false, amountUsd: 0, reason: result.message });
      continue;
    }
    s = state;
    if (result.kind === "sellAircraft") { proceeds += result.proceedsUsd; lines.push({ id: it.id, tail: result.tail, typeId: ac?.typeId ?? "", ok: true, amountUsd: result.proceedsUsd }); }
    else if (result.kind === "returnLease") { fee += result.feeUsd; saving += result.monthlySavingUsd; lines.push({ id: it.id, tail: result.tail, typeId: ac?.typeId ?? "", ok: true, amountUsd: result.feeUsd }); }
  }
  const dBefore = diversityOf(sim.world.fleet), dAfter = diversityOf(s.world.fleet);
  return {
    action, lines, count: lines.filter((l) => l.ok).length, proceedsUsd: proceeds, feeUsd: fee, netUsd: proceeds - fee,
    cashAfterUsd: s.world.cash, creditLimitBeforeUsd: creditLimitUsd(sim), creditLimitAfterUsd: creditLimitUsd(s), monthlySavingUsd: saving,
    typesBefore: dBefore.types, typesAfter: dAfter.types, diversitySavingMonthlyUsd: dBefore.monthlyUsd - dAfter.monthlyUsd,
  };
}
