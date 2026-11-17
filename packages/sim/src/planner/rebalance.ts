// Monthly ranking of the routes of each aircraft category (planner/categories.ts). The scheduler gives the highest-ranked
// routes first pick of the category's aircraft, largest aircraft first.
//
// Why not load factor: load factor depends on the aircraft that flew the route, so a route given the A380 looks emptier
// and the next month's ranking hands the A380 back, flip-flopping every month. The ranking instead uses:
//   1. Demand per departure, averaged over the month: one-way passengers who wanted the flight before seats ran out
//      (RouteReport.demandOneWay), divided by weekly frequency. It barely depends on the aircraft.
//   2. Stickiness: last month's order stands unless the lower route's demand is higher by more than `stickiness` (12%).
//   3. A profit check: a swap that passes (2) is only made when the live model says the network earns more with it.
// Pure and deterministic.
import type { Id } from "@arg/contracts";
import { dayToDate } from "../time/calendar";
import { networkWeeklyResult } from "../route/liveModel";
import type { SimState } from "../state";
import { routeCategoryOf } from "./categories";

export const CATEGORY_RANKING = {
  /** A lower-ranked route must beat the one above by more than this share of demand per departure before they swap. */
  stickiness: 0.12,
  /** Most live-model profit checks per monthly re-ranking (each is one network evaluation). */
  maxProfitChecks: 24,
} as const;

/** Demand per departure of a route in one daily report (one-way passengers who wanted a flight / weekly round trips). */
function dailyDemandPerDeparture(state: SimState, routeId: Id): number | undefined {
  const rep = state.routeReports[routeId];
  const route = state.world.routes.find((r) => r.id === routeId);
  if (!rep || !route || route.weeklyFrequency <= 0) return undefined;
  const demand = rep.demandOneWay ?? rep.evaluation.passengersPerWeek / 2;
  return demand / route.weeklyFrequency;
}

/**
 * Daily step for category ranking: add yesterday's demand per departure of each categorised route to the month's log, and on
 * the first day of a month (or when there is no ranking yet, or the set of categorised routes changed) re-rank. Returns the
 * state unchanged when there are no categorised routes.
 */
export function refreshCategoryRanking(state: SimState): SimState {
  const pl = state.planner;
  const routes = Object.keys(pl?.routeCategory ?? {}).filter((id) => routeCategoryOf(pl, id) && state.world.routes.some((r) => r.id === id)).sort();
  if (!pl || routes.length === 0) return state;

  // 1. Log today's figures (from yesterday's reports).
  const demandLog: Record<Id, { sum: number; days: number }> = {};
  for (const id of routes) {
    const prev = pl.demandLog?.[id] ?? { sum: 0, days: 0 };
    const d = dailyDemandPerDeparture(state, id);
    demandLog[id] = d === undefined ? prev : { sum: prev.sum + d, days: prev.days + 1 };
  }

  const ranked = Object.keys(pl.routeRank ?? {}).sort();
  const sameSet = ranked.length === routes.length && ranked.every((id, i) => id === routes[i]);
  const day = state.world.day;
  const monthStart = dayToDate(day).dayOfMonth === 1;
  const due = !sameSet || pl.rankDay === undefined || (monthStart && pl.rankDay !== day);
  if (!due) return { ...state, planner: { ...pl, demandLog } };
  // No route has a report yet (the first day after the category was set up): wait for real figures instead of ranking on zeros.
  if (routes.every((id) => demandLog[id]!.days === 0 && dailyDemandPerDeparture(state, id) === undefined)) return { ...state, planner: { ...pl, demandLog } };

  // 2. Monthly average demand per departure (today's figure when the month has no data yet, e.g. a route just added).
  const score = new Map<Id, number>();
  for (const id of routes) {
    const log = demandLog[id]!;
    score.set(id, log.days > 0 ? log.sum / log.days : dailyDemandPerDeparture(state, id) ?? 0);
  }

  // 3. Per category: start from last month's order (new routes placed by demand), then swap neighbours only when the lower one
  //    clearly has more demand and the network earns more with the swap.
  const byCat = new Map<Id, Id[]>();
  for (const id of routes) { const c = routeCategoryOf(pl, id)!; byCat.set(c, [...(byCat.get(c) ?? []), id]); }
  const firstRanking = pl.routeRank === undefined || Object.keys(pl.routeRank).length === 0;
  let checks = 0;
  const routeRank: Record<Id, number> = {};
  for (const [, ids] of [...byCat].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const old = ids.filter((id) => pl.routeRank?.[id] !== undefined).sort((a, b) => pl.routeRank![b]! - pl.routeRank![a]! || (a < b ? -1 : 1));
    const fresh = ids.filter((id) => pl.routeRank?.[id] === undefined).sort((a, b) => score.get(b)! - score.get(a)! || (a < b ? -1 : 1));
    const order = [...old];
    for (const id of fresh) {
      const at = order.findIndex((o) => score.get(id)! > score.get(o)!);
      order.splice(at < 0 ? order.length : at, 0, id);
    }
    if (!firstRanking) {
      const rankOf = (o: Id[]) => Object.fromEntries(o.map((id, i) => [id, o.length - i]));
      const profitOf = (o: Id[]) => networkWeeklyResult({ ...state, planner: { ...pl, routeRank: { ...pl.routeRank, ...routeRank, ...rankOf(o) } } });
      let swapped = true;
      for (let pass = 0; swapped && pass < order.length; pass++) {
        swapped = false;
        for (let i = 0; i + 1 < order.length; i++) {
          const hi = order[i]!, lo = order[i + 1]!;
          if (!(score.get(lo)! > score.get(hi)! * (1 + CATEGORY_RANKING.stickiness))) continue;
          if (checks >= CATEGORY_RANKING.maxProfitChecks) continue;
          checks += 2;
          const swappedOrder = [...order];
          swappedOrder[i] = lo; swappedOrder[i + 1] = hi;
          if (profitOf(swappedOrder) > profitOf(order) + 1e-6) { order.splice(0, order.length, ...swappedOrder); swapped = true; }
        }
      }
    }
    order.forEach((id, i) => { routeRank[id] = order.length - i; });
  }
  const fresh: Record<Id, { sum: number; days: number }> = {};
  for (const id of routes) fresh[id] = { sum: 0, days: 0 };
  return { ...state, planner: { ...pl, routeRank, rankDay: day, demandLog: fresh, rankScore: Object.fromEntries([...score]) } };
}
