// Pure helpers for the Fare policy panel: drafts, validation, scope text, per-route coverage and reordering.
import type { Airport, FarePolicy, Id, Route, RouteCategory } from "@arg/contracts";
import { FARE_POLICY_LIMITS, effectiveTargetLoadFactor, matchingPolicy, policyCovers, routeCategories } from "@arg/sim";

export const CATEGORY_GROUPS: ReadonlyArray<{ label: string; cats: ReadonlyArray<{ id: RouteCategory; label: string }> }> = [
  { label: "Distance", cats: [{ id: "short", label: "Short (under 1,500 km)" }, { id: "medium", label: "Medium (1,500-4,000 km)" }, { id: "long", label: "Long (4,000-9,000 km)" }, { id: "ultra-long", label: "Ultra-long (over 9,000 km)" }] },
  { label: "Market", cats: [{ id: "domestic", label: "Domestic" }, { id: "international", label: "International" }] },
  { label: "Network", cats: [{ id: "hub-spoke", label: "Hub-spoke" }, { id: "point-to-point", label: "Point-to-point" }] },
];
const CAT_LABEL = new Map(CATEGORY_GROUPS.flatMap((g) => g.cats.map((c) => [c.id, c.label.split(" (")[0]!] as const)));
export const categoryLabel = (c: RouteCategory): string => CAT_LABEL.get(c) ?? c;

export const TARGET_MIN_PCT = Math.round(FARE_POLICY_LIMITS.targetLoadFactor.min * 100);
export const TARGET_MAX_PCT = Math.round(FARE_POLICY_LIMITS.targetLoadFactor.max * 100);
export const MARKDOWN_MAX_PCT = Math.round(FARE_POLICY_LIMITS.connectionMarkdown.max * 100);

/** Editable form state; percentages are whole numbers. */
export interface PolicyDraft {
  id: Id;
  name: string;
  /** false = "off": covered routes get no target from this policy. */
  targetOn: boolean;
  targetPct: number;
  markdownPct: number;
  all: boolean;
  categories: RouteCategory[];
  routeIds: Id[];
}

/** Next free id of the form fp-1, fp-2, ... */
export function newPolicyId(existing: readonly Pick<FarePolicy, "id">[]): Id {
  const used = new Set(existing.map((p) => p.id));
  let i = existing.length + 1;
  while (used.has(`fp-${i}`)) i++;
  return `fp-${i}`;
}

export function blankDraft(existing: readonly Pick<FarePolicy, "id">[]): PolicyDraft {
  return { id: newPolicyId(existing), name: "", targetOn: true, targetPct: 80, markdownPct: 0, all: true, categories: [], routeIds: [] };
}

export function draftFromPolicy(p: FarePolicy): PolicyDraft {
  const sc = p.scope === "all" ? null : p.scope;
  const all = sc === null;
  return {
    id: p.id, name: p.name, targetOn: p.targetLoadFactor !== null, targetPct: p.targetLoadFactor === null ? 80 : Math.round(p.targetLoadFactor * 100),
    markdownPct: Math.round(p.connectionMarkdown * 100), all, categories: [...(sc?.categories ?? [])], routeIds: [...(sc?.routeIds ?? [])],
  };
}

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
export const clampTargetPct = (v: number): number => clampInt(v, TARGET_MIN_PCT, TARGET_MAX_PCT);
export const clampMarkdownPct = (v: number): number => clampInt(v, 0, MARKDOWN_MAX_PCT);

/** Turn a draft into a policy the sim accepts. Routes that no longer exist are dropped from the scope. */
export function draftToPolicy(d: PolicyDraft, validRouteIds: ReadonlySet<Id>): { ok: true; policy: FarePolicy } | { ok: false; error: string } {
  const name = d.name.trim();
  if (!name) return { ok: false, error: "Give the policy a name." };
  const routeIds = d.routeIds.filter((id) => validRouteIds.has(id));
  if (!d.all && d.categories.length === 0 && routeIds.length === 0) return { ok: false, error: "Pick at least one category or route, or choose All routes." };
  const scope: FarePolicy["scope"] = d.all ? "all" : { ...(d.categories.length > 0 ? { categories: [...d.categories] } : {}), ...(routeIds.length > 0 ? { routeIds } : {}) };
  return { ok: true, policy: { id: d.id, name, targetLoadFactor: d.targetOn ? clampTargetPct(d.targetPct) / 100 : null, connectionMarkdown: clampMarkdownPct(d.markdownPct) / 100, scope } };
}

/** "All routes" / "Short, International + 2 routes". */
export function scopeText(p: Pick<FarePolicy, "scope">): string {
  if (p.scope === "all") return "All routes";
  const parts: string[] = [];
  if (p.scope.categories?.length) parts.push(p.scope.categories.map(categoryLabel).join(", "));
  const n = p.scope.routeIds?.length ?? 0;
  if (n > 0) parts.push(`${n} route${n === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" + ") : "No routes";
}

export const targetText = (t: number | null | undefined): string => (t === null || t === undefined ? "off" : `${Math.round(t * 100)}%`);

export type TargetSource = { kind: "route" } | { kind: "policy"; policyId: Id; name: string } | { kind: "none" };

export interface CoverageRow {
  routeId: Id;
  name: string;
  categories: RouteCategory[];
  /** Every policy covering the route, in list order (the last one wins). */
  covering: Id[];
  /** The route's own target (overrides every policy), if set. */
  routeTarget: number | undefined;
  /** Target the weekly solve steers to, and where it comes from. */
  target: number | undefined;
  source: TargetSource;
}

/** Per route: which policies cover it and the effective target (route target, else last matching policy). */
export function coverage(policies: readonly FarePolicy[], routes: readonly Route[], airports: readonly Airport[], hubs: readonly Id[]): CoverageRow[] {
  const index = new Map(airports.map((a) => [a.id, a]));
  return routes.map((r) => {
    const win = matchingPolicy(r, policies, index, hubs);
    const source: TargetSource = r.targetLoadFactor !== undefined ? { kind: "route" } : win ? { kind: "policy", policyId: win.id, name: win.name } : { kind: "none" };
    return {
      routeId: r.id, name: `${r.origin}–${r.destination}`, categories: routeCategories(r, index, hubs),
      covering: policies.filter((p) => policyCovers(p, r, index, hubs)).map((p) => p.id),
      routeTarget: r.targetLoadFactor, target: effectiveTargetLoadFactor(r, policies, index, hubs), source,
    };
  });
}

/** The policy list with `draft` applied: replaced in place when its id exists, else appended. */
export function withPolicy(policies: readonly FarePolicy[], draft: FarePolicy): FarePolicy[] {
  return policies.some((p) => p.id === draft.id) ? policies.map((p) => (p.id === draft.id ? draft : p)) : [...policies, draft];
}

/** Swap the policy at `index` with its neighbour (delta -1 up, +1 down); same list when out of range. */
export function moveBy<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}

/** Commands that turn `from` into `to` (same ids): setFarePolicy replaces in place, so a reorder removes the changed tail and re-adds it in order. */
export function reorderPlan(from: readonly FarePolicy[], to: readonly FarePolicy[]): { remove: Id[]; add: FarePolicy[] } {
  let i = 0;
  while (i < from.length && i < to.length && from[i]!.id === to[i]!.id) i++;
  return { remove: from.slice(i).map((p) => p.id), add: to.slice(i) };
}

/** Case-insensitive match of a route's name ("LAX-SFO", "LAX–SFO", "lax sfo") against a search text. */
export function filterRoutes<T extends { origin: string; destination: string }>(routes: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase().replace(/[–-]/g, " ");
  if (!q) return [...routes];
  const words = q.split(/\s+/);
  return routes.filter((r) => { const hay = `${r.origin} ${r.destination}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}
