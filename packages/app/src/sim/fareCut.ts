// Expected effect of each response to a rival fare cut, for the decision card.
// Uses the route preview model (projectRoute) only as a *relative* yardstick: a rival that cuts p% while we hold is modelled as
// our fares being 1/(1-p) higher against an unchanged rival. Every figure is a change against the same preview of the route
// before the cut, so model offsets cancel; it shows direction and rough size, not live profit (see QA.md, B02).
import type { Day, Route } from "@arg/contracts";
import { scaleFares } from "../rivals/helpers";
import { projectRoute } from "../routes/helpers";
import { formatMoney } from "./format";

export interface CutEstimate { profitDelta: number; loadFactor: number }
export interface FareCutEffects { hold: CutEstimate; match: CutEstimate; partial: CutEstimate; baselineLoad: number }

/** Profit change per week and resulting load factor if we charge `fares` on `frequency` flights while a rival has cut by `pct` percent. */
function afterCut(route: Route, day: Day, fares: Route["fares"], frequency: number, pct: number, baseline: { profit: number }): CutEstimate | null {
  const rel = scaleFares(fares, 1 / (1 - pct / 100)); // price relative to the rival, in the preview's own terms
  const ev = projectRoute({ ...route, fares: rel, weeklyFrequency: frequency }, day)?.evaluation;
  if (!ev || !ev.feasible) return null;
  const real = ev.revenue * (fares.Y / rel.Y); // what we really collect: same passengers at the lower real fare
  return { profitDelta: real - (ev.revenue - ev.profit) - baseline.profit, loadFactor: ev.loadFactor };
}

/** Null when the preview cannot evaluate the route. */
export function fareCutEffects(route: Route, day: Day, pct: number, canAdd: boolean): FareCutEffects | null {
  const base = projectRoute(route, day)?.evaluation;
  if (!base || !base.feasible) return null;
  const f = route.fares;
  const hold = afterCut(route, day, f, route.weeklyFrequency, pct, base);
  const match = afterCut(route, day, scaleFares(f, 1 - pct / 100), route.weeklyFrequency, pct, base);
  const partial = afterCut(route, day, scaleFares(f, 1 - pct / 200), route.weeklyFrequency + (canAdd ? 1 : 0), pct, base);
  if (!hold || !match || !partial) return null;
  return { hold, match, partial, baselineLoad: base.loadFactor };
}

const money = (v: number) => formatMoney(v, { sign: true });
/** "est. -$120K/wk, load 61%" */
export const effectText = (e: CutEstimate): string => `est. ${money(e.profitDelta)}/wk, load ${Math.round(e.loadFactor * 100)}%`;
