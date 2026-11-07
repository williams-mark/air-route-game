// Fare policies (lane/sim-policy): route categories, effective target load factor and connection markdown. Pure.
import type { Airport, FarePolicy, Id, Route, RouteCategory } from "@arg/contracts";
import { distanceKm } from "../geo";
import { ownedHubsOf } from "../fleet/hubs";

/** Great-circle distance bands, km. short < 1500, medium 1500-4000, long 4000-9000, ultra-long > 9000. */
export const DISTANCE_BANDS = { shortBelowKm: 1500, mediumBelowKm: 4000, longBelowKm: 9000 } as const;
/** Allowed ranges (commands reject values outside them). */
export const FARE_POLICY_LIMITS = { targetLoadFactor: { min: 0.5, max: 0.95 }, connectionMarkdown: { min: 0, max: 0.5 } } as const;

type AirportSource = ReadonlyMap<Id, Airport> | readonly Airport[];
type HubSource = ReadonlySet<Id> | readonly Id[];
const airportOf = (src: AirportSource, id: Id): Airport | undefined =>
  Array.isArray(src) ? (src as readonly Airport[]).find((a) => a.id === id) : (src as ReadonlyMap<Id, Airport>).get(id);

/**
 * Categories a route belongs to: one distance band (short / medium / long / ultra-long), "domestic" when both ends share a country
 * else "international", and "hub-spoke" when either end is in `hubs` (the player's hubs, see `playerHubs`) else "point-to-point".
 * With `hubs` omitted every route is point-to-point. Unknown airports give an empty list.
 */
export function routeCategories(route: Pick<Route, "origin" | "destination">, airports: AirportSource, hubs: HubSource = []): RouteCategory[] {
  const a = airportOf(airports, route.origin), b = airportOf(airports, route.destination);
  if (!a || !b) return [];
  const km = distanceKm(a, b);
  const band: RouteCategory = km < DISTANCE_BANDS.shortBelowKm ? "short" : km < DISTANCE_BANDS.mediumBelowKm ? "medium" : km <= DISTANCE_BANDS.longBelowKm ? "long" : "ultra-long";
  const hubSet = new Set<Id>(hubs as Iterable<Id>);
  return [band, a.country === b.country ? "domestic" : "international", hubSet.has(a.id) || hubSet.has(b.id) ? "hub-spoke" : "point-to-point"];
}

/** Does the policy cover the route? Category scopes need `airports` (without it only "all" and routeIds can match). */
export function policyCovers(policy: FarePolicy, route: Route, airports?: AirportSource, hubs?: HubSource): boolean {
  const s = policy.scope;
  if (s === "all") return true;
  if (s.routeIds?.includes(route.id)) return true;
  if (s.categories && s.categories.length > 0 && airports) {
    const cats = routeCategories(route, airports, hubs);
    return s.categories.some((c) => cats.includes(c));
  }
  return false;
}

/** The last policy (in list order) covering the route, or null. */
export function matchingPolicy(route: Route, policies: readonly FarePolicy[] | undefined, airports?: AirportSource, hubs?: HubSource): FarePolicy | null {
  if (!policies) return null;
  for (let i = policies.length - 1; i >= 0; i--) if (policyCovers(policies[i]!, route, airports, hubs)) return policies[i]!;
  return null;
}

/**
 * Target load factor the weekly solve steers a route to: Route.targetLoadFactor wins, else the last matching policy's target,
 * else undefined (no target; fares left alone). A matching policy with a null target switches an earlier policy's target off.
 */
export function effectiveTargetLoadFactor(route: Route, policies: readonly FarePolicy[] | undefined, airports?: AirportSource, hubs?: HubSource): number | undefined {
  if (route.targetLoadFactor !== undefined) return route.targetLoadFactor;
  return matchingPolicy(route, policies, airports, hubs)?.targetLoadFactor ?? undefined;
}

/** Connection markdown (0..0.5) of the last matching policy; 0 when none. */
export function effectiveConnectionMarkdown(route: Route, policies: readonly FarePolicy[] | undefined, airports?: AirportSource, hubs?: HubSource): number {
  return matchingPolicy(route, policies, airports, hubs)?.connectionMarkdown ?? 0;
}

/** Hubs of the player: the home hub, the bases of aircraft, and airports with a chosen terminal. Sorted. */
export function playerHubs(state: Parameters<typeof ownedHubsOf>[0]): Id[] {
  return ownedHubsOf(state);
}
