import { useMemo } from "react";
import type { Day, Route } from "@arg/contracts";
import type { MapRoute, ProfitTier } from "../map/types";
import { useSim } from "../sim/useSim";
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
}

export function summarizeRoute(route: Route, day: Day, world: World = dataWorld): RouteSummary {
  const ev = projectRoute(route, day, world)?.evaluation;
  return {
    route, name: routeName(route),
    tier: ev ? profitTier(ev.margin, ev.feasible) : "loss",
    weeklyProfit: ev?.profit ?? 0, revenue: ev?.revenue ?? 0, loadFactor: ev?.loadFactor ?? 0, margin: ev?.margin ?? 0, feasible: ev?.feasible ?? false,
  };
}

/** Summaries of the player's routes; recomputed when routes change or a new month starts (seasonality). */
export function useRouteSummaries(): RouteSummary[] {
  const { routes, day } = useSim();
  const bucket = Math.floor(day / 30);
  return useMemo(() => routes.map((r) => summarizeRoute(r, bucket * 30 + 15)), [routes, bucket]);
}

export function toMapRoutes(list: RouteSummary[]): MapRoute[] {
  return list.map((s) => ({ ...s.route, tier: s.tier, weeklyProfitUsd: Math.round(s.weeklyProfit) }));
}
