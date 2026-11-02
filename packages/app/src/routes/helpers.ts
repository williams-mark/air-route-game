// Pure helpers for the route inspector, creation sandbox and Routes view.
// Projections call @arg/sim (simulateRouteWeek / evaluateRoute) with real @arg/data inputs; nothing here has side effects.
import type { AircraftType, Airport, CabinClass, Day, Fares, Id, Route } from "@arg/contracts";
import { aircraftTypes, airports, canFlyRoute, distanceKm } from "@arg/data";
import { benchmarkFare, daysInMonth, dayToDate, pairMarket, simulateRouteWeek, type RouteWeek } from "@arg/sim";
import type { ProfitTier } from "../map/types";

export interface World {
  airports: ReadonlyMap<Id, Airport>;
  types: ReadonlyMap<Id, AircraftType>;
}
export const dataWorld: World = {
  airports: new Map(airports.map((a) => [a.id, a])),
  types: new Map(aircraftTypes.map((t) => [t.id, t])),
};

export type RouteDraft = Omit<Route, "id">;

export const FREQ_SWEEP_MAX = 28;
export const FREQ_MAX = 84;
export const CABINS: CabinClass[] = ["F", "J", "W", "Y"];
export const CABIN_NAME: Record<CabinClass, string> = { F: "First", J: "Business", W: "Premium economy", Y: "Economy" };
/** Typical premium fare multipliers over economy; mirrors the sim's PREMIUM_FARE_MULTIPLIER used when a cabin is unpriced. */
export const PREMIUM_MULTIPLIER: Record<CabinClass, number> = { F: 5, J: 3.2, W: 1.7, Y: 1 };
export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const routeName = (r: Pick<Route, "origin" | "destination">) => `${r.origin}–${r.destination}`;

/** Full weekly picture for a route on `day`, or null for unknown airports/types. */
export function projectRoute(route: Route, day: Day, world: World = dataWorld): RouteWeek | null {
  return simulateRouteWeek(route, world.airports, world.types, day);
}

// --- Frequency sweep -------------------------------------------------------

export interface SweepPoint {
  frequency: number;
  profit: number;
  revenue: number;
  loadFactor: number;
  feasible: boolean;
}

/** Evaluate a route draft across 1..max weekly frequencies (all else equal). */
export function frequencySweep(draft: RouteDraft, day: Day, world: World = dataWorld, max = FREQ_SWEEP_MAX): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (let f = 1; f <= max; f++) {
    const wk = projectRoute({ ...draft, id: "sweep", weeklyFrequency: f }, day, world);
    const ev = wk?.evaluation;
    out.push({ frequency: f, profit: ev?.profit ?? 0, revenue: ev?.revenue ?? 0, loadFactor: ev?.loadFactor ?? 0, feasible: !!ev?.feasible });
  }
  return out;
}

/** Highest-profit feasible point; ties go to the lower frequency. Null when nothing is feasible. */
export function bestFrequency(points: readonly SweepPoint[]): SweepPoint | null {
  let best: SweepPoint | null = null;
  for (const p of points) {
    if (!p.feasible) continue;
    if (!best || p.profit > best.profit + 1e-9) best = p;
  }
  return best;
}

// --- Fares -----------------------------------------------------------------

/** Market fare per cabin for a distance: the model's benchmark economy yield curve times the premium multipliers. */
export function marketFares(km: number): Required<Fares> {
  const y = benchmarkFare(km);
  const round = (x: number) => Math.round(x);
  return { Y: round(y), W: round(y * PREMIUM_MULTIPLIER.W), J: round(y * PREMIUM_MULTIPLIER.J), F: round(y * PREMIUM_MULTIPLIER.F) };
}
export const fareHint = (km: number, cls: CabinClass): number => marketFares(km)[cls];

/** Parse text inputs into Fares. Y is required (>0); other cabins are dropped when blank. Null if Y is missing or any entry is invalid. */
export function parseFares(input: Partial<Record<CabinClass, string>>): Fares | null {
  const num = (s: string | undefined): number | null | undefined => {
    if (s === undefined || s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const y = num(input.Y);
  if (!y) return null;
  const out: Fares = { Y: y };
  for (const c of ["W", "J", "F"] as const) {
    const v = num(input[c]);
    if (v === null) return null;
    if (v !== undefined) out[c] = v;
  }
  return out;
}

export function faresToText(f: Fares): Record<CabinClass, string> {
  return { F: f.F?.toString() ?? "", J: f.J?.toString() ?? "", W: f.W?.toString() ?? "", Y: String(f.Y) };
}

// --- Tiers / months --------------------------------------------------------

/** Map tier from weekly economics: >=6% margin profitable, down to -3% marginal, otherwise losing. */
export function profitTier(margin: number, feasible = true): ProfitTier {
  if (!feasible) return "loss";
  return margin >= 0.06 ? "profit" : margin >= -0.03 ? "marginal" : "loss";
}

/** Day index of the 15th of `month` (0..11) in the calendar year containing `day`. */
export function midMonthDay(day: Day, month: number): Day {
  const c = dayToDate(day);
  let d = Math.floor(day) - c.dayOfYear;
  for (let m = 0; m < month; m++) d += daysInMonth(c.year, m);
  return d + 14;
}

export interface MonthProfit { month: number; label: string; profit: number }

/** Approximate monthly profit by month for the year containing `day` (weekly profit at mid-month x weeks in month). */
export function seasonalProfit(route: Route, day: Day, world: World = dataWorld): MonthProfit[] {
  const year = dayToDate(day).year;
  return MONTH_LABELS.map((label, month) => {
    const wk = projectRoute(route, midMonthDay(day, month), world);
    const weekly = wk?.evaluation.profit ?? 0;
    return { month, label, profit: weekly * (daysInMonth(year, month) / 7) };
  });
}

// --- Aircraft / airports ---------------------------------------------------

export interface TypeOption { type: AircraftType; available: boolean }

/** Types that can fly a->b (data canFlyRoute). `available` is false before introYear / after endYear of `year`. */
export function eligibleTypes(a: Airport, b: Airport, year: number, types: readonly AircraftType[] = aircraftTypes): TypeOption[] {
  return types
    .filter((t) => canFlyRoute(t, a, b))
    .map((type) => ({ type, available: year >= type.introYear && (type.endYear === null || year <= type.endYear) }))
    .sort((x, y) => x.type.maxSeats - y.type.maxSeats);
}

/** The available eligible type with the best weekly profit at `freq`. Falls back to the first eligible. */
export function bestType(a: Airport, b: Airport, day: Day, freq = 7, world: World = dataWorld): AircraftType | null {
  const year = dayToDate(day).year;
  const opts = eligibleTypes(a, b, year, [...world.types.values()]);
  const usable = opts.filter((o) => o.available);
  const pool = usable.length > 0 ? usable : opts;
  let best: { t: AircraftType; p: number } | null = null;
  const fares: Fares = { Y: marketFares(distanceKm(a, b)).Y };
  for (const o of pool) {
    const wk = projectRoute({ id: "probe", origin: a.id, destination: b.id, weeklyFrequency: freq, fares, typeId: o.type.id }, day, world);
    const p = wk?.evaluation.profit ?? -Infinity;
    if (!best || p > best.p) best = { t: o.type, p };
  }
  return best?.t ?? null;
}

/** Autocomplete: exact IATA, IATA prefix, city/name prefix, then substring. Excludes `exclude` ids. */
export function suggestAirports(query: string, list: readonly Airport[], opts: { limit?: number; exclude?: readonly Id[] } = {}): Airport[] {
  const q = query.trim().toLowerCase();
  const skip = new Set(opts.exclude ?? []);
  const rank = (a: Airport): number => {
    const id = a.id.toLowerCase(), city = a.city.toLowerCase(), name = a.name.toLowerCase();
    if (q === "") return 5;
    if (id === q) return 0;
    if (id.startsWith(q)) return 1;
    if (city.startsWith(q) || name.startsWith(q)) return 2;
    if (city.includes(q) || name.includes(q)) return 3;
    return -1;
  };
  return list
    .filter((a) => !skip.has(a.id))
    .map((a) => ({ a, r: rank(a) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || y.a.metroPopulation - x.a.metroPopulation)
    .slice(0, opts.limit ?? 6)
    .map((x) => x.a);
}

// --- Market / competitors --------------------------------------------------

export interface MarketInfo {
  distanceKm: number;
  weeklyOneWay: number;
  shares: Record<"business" | "leisure" | "vfr" | "budget", number>;
}
export function marketInfo(a: Airport, b: Airport): MarketInfo {
  const m = pairMarket(a, b);
  return { distanceKm: m.distanceKm, weeklyOneWay: m.baseWeekly, shares: m.shares };
}

export interface RivalInfo {
  directFrequency: number;
  directSeats: number;
  fare: number;
  oneStop: boolean;
  oneStopFare: number | null;
}
/** The synthetic rival the sim places on every pair (see simulateRouteWeek): sized to the market at 80% load. */
export function rivalPresence(a: Airport, b: Airport): RivalInfo {
  const km = distanceKm(a, b);
  const seats = km > 3000 ? 250 : km > 1200 ? 180 : 140;
  const freq = Math.max(3, Math.ceil(pairMarket(a, b).baseWeekly / 0.8 / seats));
  const fare = benchmarkFare(km);
  const oneStop = km >= 800;
  return { directFrequency: freq, directSeats: seats, fare, oneStop, oneStopFare: oneStop ? fare * 0.85 : null };
}

// --- Validation (shared by the UI and the mock bridge) ---------------------

export interface CommandError { code: string; message: string }

export function validateRouteDraft(draft: RouteDraft, existing: readonly Route[], world: World = dataWorld, ignoreId?: Id): CommandError | null {
  const a = world.airports.get(draft.origin), b = world.airports.get(draft.destination);
  if (!a || !b) return { code: "unknown_airport", message: `Unknown airport ${!a ? draft.origin : draft.destination}.` };
  if (a.id === b.id) return { code: "same_airport", message: "Origin and destination must be different airports." };
  const dup = existing.find((r) => r.id !== ignoreId && ((r.origin === a.id && r.destination === b.id) || (r.origin === b.id && r.destination === a.id)));
  if (dup) return { code: "duplicate_route", message: `You already fly ${routeName(dup)}. Edit it instead.` };
  const t = world.types.get(draft.typeId);
  if (!t) return { code: "unknown_type", message: `Unknown aircraft type ${draft.typeId}.` };
  if (!canFlyRoute(t, a, b)) return { code: "cannot_fly", message: `${t.id} cannot fly ${routeName(draft)} (range, runway or overwater limit).` };
  if (!Number.isInteger(draft.weeklyFrequency) || draft.weeklyFrequency < 1 || draft.weeklyFrequency > FREQ_MAX) {
    return { code: "bad_frequency", message: `Frequency must be a whole number from 1 to ${FREQ_MAX} per week.` };
  }
  if (!(draft.fares.Y > 0)) return { code: "bad_fare", message: "Economy fare must be above zero." };
  return null;
}
