import { useMemo } from "react";
import type { Day, Route } from "@arg/contracts";
import type { RouteReport } from "@arg/sim";
import type { MapRoute, ProfitTier } from "../map/types";
import { bridge, useSimSelector } from "../sim/useSim";
import { dataWorld, profitTier, projectRoute, routeName, type World } from "./helpers";

export interface RouteSummary {
  route: Route;
  name: string;
  tier: ProfitTier;
  weeklyProfit: number;
  revenue: number;
  loadFactor: number;
  margin: number;
  feasible: boolean;
  /** Round trips a week actually flown (real sim only). */
  scheduled?: number;
  /** True when the figures are the sim's own report rather than a UI-side projection. */
  fromSim: boolean;
}

/** Summary from the sim's own report for the route (the real bridge). */
export function summarizeReport(route: Route, rep: RouteReport): RouteSummary {
  const ev = rep.evaluation;
  return {
    route, name: routeName(route), tier: profitTier(ev.margin, ev.feasible),
    weeklyProfit: ev.profit, revenue: ev.revenue, loadFactor: ev.loadFactor, margin: ev.margin, feasible: ev.feasible,
    scheduled: rep.scheduling?.scheduledFrequency, fromSim: true,
  };
}

/** Fallback when there is no report yet (mock bridge, or a route opened a moment ago): project it from the route model. */
export function summarizeRoute(route: Route, day: Day, world: World = dataWorld): RouteSummary {
  const ev = projectRoute(route, day, world)?.evaluation;
  return {
    route, name: routeName(route),
    tier: ev ? profitTier(ev.margin, ev.feasible) : "loss",
    weeklyProfit: ev?.profit ?? 0, revenue: ev?.revenue ?? 0, loadFactor: ev?.loadFactor ?? 0, margin: ev?.margin ?? 0, feasible: ev?.feasible ?? false,
    fromSim: false,
  };
}

/**
 * Summaries of the player's routes, refreshed when routes change or a new week starts (the sim's figures are weekly
 * and move slowly, so the map and tables do not need to repaint every frame at high speed).
 */
export function useRouteSummaries(): RouteSummary[] {
  const routes = useSimSelector((s) => s.routes);
  const week = useSimSelector((s) => Math.floor(s.day / 7));
  const reportsKey = useSimSelector((s) => Object.keys(s.reports).length);
  return useMemo(() => {
    const { reports } = bridge.getState();
    return routes.map((r) => {
      const rep = reports[r.id];
      return rep ? summarizeReport(r, rep) : summarizeRoute(r, Math.floor(week / 4) * 28 + 15);
    });
  }, [routes, week, reportsKey]);
}

export function toMapRoutes(list: RouteSummary[]): MapRoute[] {
  return list.map((s) => ({ ...s.route, tier: s.tier, weeklyProfitUsd: Math.round(s.weeklyProfit) }));
}
