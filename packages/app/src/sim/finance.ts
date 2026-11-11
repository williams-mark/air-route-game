// Daily finance records kept by the bridge, and their monthly roll-up for the Finance view.
import type { Day, FinanceSnapshot, Id } from "@arg/contracts";
import { dayToDate, type RouteReport } from "@arg/sim";

export const COST_KEYS = ["fuel", "crew", "maintenance", "fees", "sales", "fleet", "interest", "diversity"] as const;
export type CostKey = (typeof COST_KEYS)[number];

/** One simulated day. Cost categories sum to `costs`. */
export interface DayRecord {
  day: Day;
  cash: number;
  revenue: number;
  costs: number;
  profit: number;
  by: Record<CostKey, number>;
}

const CATEGORY: Record<string, CostKey | undefined> = {
  fuel: "fuel", crew: "crew", maintenance: "maintenance",
  airport: "fees", handling: "fees", paxServices: "fees",
  distribution: "sales", overhead: "sales", ownership: "fleet",
};

/**
 * Break a day's FinanceSnapshot down by cost category using the route reports of that day; `interest` is the overdraft interest and
 * `diversity` the fleet commonality overhead (extra aircraft types), both inside `snap.costs`.
 */
export function dayRecord(snap: FinanceSnapshot, reports: Record<Id, RouteReport>, interest = 0, diversity = 0): DayRecord {
  const by: Record<CostKey, number> = { fuel: 0, crew: 0, maintenance: 0, fees: 0, sales: 0, fleet: 0, interest, diversity };
  let routeCosts = 0;
  for (const rep of Object.values(reports)) {
    for (const line of rep.evaluation.lines) {
      if (line.group !== "cost") continue;
      const k = CATEGORY[line.key] ?? "sales";
      by[k] += line.weekly / 7;
      routeCosts += line.weekly / 7;
    }
  }
  // Lease, corporate overhead and maintenance checks are charged at fleet level: whatever the routes do not explain.
  by.fleet += snap.costs - routeCosts - interest - diversity;
  return { day: snap.day, cash: snap.cash, revenue: snap.revenue, costs: snap.costs, profit: snap.profit, by };
}

export interface MonthRecord {
  /** Months since January 2015. */
  index: number;
  year: number;
  month: number;
  label: string;
  days: number;
  revenue: number;
  costs: number;
  profit: number;
  by: Record<CostKey, number>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar-month totals from daily records (the current month is partial). Oldest first. */
export function monthly(records: readonly DayRecord[]): MonthRecord[] {
  const out: MonthRecord[] = [];
  for (const r of records) {
    const d = dayToDate(r.day);
    const index = (d.year - 2015) * 12 + d.month;
    let m = out[out.length - 1];
    if (!m || m.index !== index) {
      m = { index, year: d.year, month: d.month, label: `${MONTHS[d.month]} ${d.year}`, days: 0, revenue: 0, costs: 0, profit: 0, by: { fuel: 0, crew: 0, maintenance: 0, fees: 0, sales: 0, fleet: 0, interest: 0, diversity: 0 } };
      out.push(m);
    }
    m.days++; m.revenue += r.revenue; m.costs += r.costs; m.profit += r.profit;
    for (const k of COST_KEYS) m.by[k] += r.by[k] ?? 0; // records from older saves have no interest or diversity entry
  }
  return out;
}
