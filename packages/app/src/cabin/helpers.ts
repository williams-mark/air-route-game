// Pure helpers for the cabin editor (no React). Tested in helpers.test.ts.
import type { AircraftType, CabinClass, CabinLayout, CabinSection, ServiceLevel } from "@arg/contracts";
import {
  allowedAcross, benchmarkFareFor, cabinGeometry, deckLengths, deckOf, distanceKm, CABIN_CLASSES, hasUpperDeckSections, layoutLengthM, pitchLimits,
  rowsFitting, SECTION_DIVIDER_M, simulateRouteWeek, validateCabinLayout, type Deck,
} from "@arg/sim";
import type { Airport } from "@arg/contracts";

export const CLASS_LABEL: Record<CabinClass, string> = { F: "First", J: "Business", W: "Premium economy", Y: "Economy" };
export const CLASS_SHORT: Record<CabinClass, string> = { F: "First", J: "Biz", W: "Prem", Y: "Econ" };

// Sections are keyed by class and deck: a 747 or A380 may have a section of each class on each deck (cabin/decks.ts in the sim).
// `deck` defaults to the main deck, which is the only deck of every other type.
const on = (deck: Deck) => (s: CabinSection) => deckOf(s) === deck;

export function sectionOf(layout: CabinLayout, cls: CabinClass, deck: Deck = "main"): CabinSection | undefined {
  return layout.sections.find((s) => s.cls === cls && deckOf(s) === deck);
}

/** Sections in front-to-back order: the upper deck's first (its sections sit over the front of the main deck), each F, J, W, Y. */
export function sortSections(sections: CabinSection[]): CabinSection[] {
  const key = (s: CabinSection) => (deckOf(s) === "upper" ? 0 : 10) + CABIN_CLASSES.indexOf(s.cls);
  return [...sections].sort((a, b) => key(a) - key(b));
}

/** A sensible starting section for a class the player switches on (on the upper deck: that deck's seats across). */
export function newSection(type: AircraftType, cls: CabinClass, deck: Deck = "main"): CabinSection | null {
  const opts = allowedAcross(type, cls, deck);
  if (opts.length === 0) return null;
  const geo = cabinGeometry(type);
  const [lo, hi] = pitchLimits(cls, geo);
  const typical: Record<CabinClass, number> = { F: 78, J: geo.bodyClass === "widebody" ? 60 : 37, W: 38, Y: 31 };
  const across = deck === "upper" ? opts[opts.length - 1]!.across : opts[0]!.across;
  return { cls, rows: cls === "Y" ? 10 : cls === "J" ? 4 : 2, seatsAcross: across, pitchIn: Math.min(hi, Math.max(lo, typical[cls])), ...(deck === "upper" ? { deck } : {}) };
}

/** Replace, add (when `patch` is a section) or remove (null) the section of a class on a deck. */
export function setSection(layout: CabinLayout, cls: CabinClass, patch: Partial<CabinSection> | null, type?: AircraftType, deck: Deck = "main"): CabinLayout {
  const rest = layout.sections.filter((s) => !(s.cls === cls && deckOf(s) === deck));
  if (patch === null) return { sections: rest };
  const cur = sectionOf(layout, cls, deck) ?? (type ? newSection(type, cls, deck) : null);
  if (!cur) return layout;
  const { deck: _d, ...p } = patch;
  return { sections: sortSections([...rest, { ...cur, ...p, cls, ...(deck === "upper" ? { deck } : {}) }]) };
}

/**
 * Usable length of a deck for this layout: each deck's own length once the layout uses the upper deck; an older single-list
 * layout (no upper-deck section) keeps the whole equivalent length on the main deck, as the sim's rules do.
 */
export function deckLengthFor(type: AircraftType, layout: CabinLayout, deck: Deck): number {
  const lengths = deckLengths(type);
  if (lengths && (deck === "upper" || hasUpperDeckSections(layout))) return lengths[deck];
  return cabinGeometry(type).usableLengthM;
}

/** Most rows a class can have on its deck given the deck's other sections and length (ignores the seat maximum). */
export function maxRowsFor(type: AircraftType, layout: CabinLayout, cls: CabinClass, deck: Deck = "main"): number {
  const s = sectionOf(layout, cls, deck);
  if (!s) return 0;
  const others = { sections: layout.sections.filter((x) => on(deck)(x) && x.cls !== cls) };
  const used = layoutLengthM(others) + (others.sections.length > 0 ? SECTION_DIVIDER_M : 0);
  return Math.max(1, rowsFitting(deckLengthFor(type, layout, deck) - used, s.pitchIn));
}

/** Set a deck's economy to the number of rows that fills the deck's remaining length and stays within the seat maximum. */
export function fillEconomy(type: AircraftType, layout: CabinLayout, deck: Deck = "main"): CabinLayout {
  const y = sectionOf(layout, "Y", deck);
  if (!y) return layout;
  const others = layout.sections.filter((s) => s !== y);
  const otherSeats = others.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
  const byLength = maxRowsFor(type, layout, "Y", deck);
  const bySeats = Math.floor((type.maxSeats - otherSeats) / y.seatsAcross);
  return setSection(layout, "Y", { rows: Math.max(1, Math.min(byLength, bySeats)) }, undefined, deck);
}

/** Keep seats across valid for the type after a change of layout (used when switching type); upper-deck sections need an upper deck. */
export function conform(type: AircraftType, layout: CabinLayout): CabinLayout {
  const sections = layout.sections.flatMap((s) => {
    const opts = allowedAcross(type, s.cls, deckOf(s));
    if (opts.length === 0) return [];
    const across = opts.some((o) => o.across === s.seatsAcross) ? s.seatsAcross : opts[opts.length - 1]!.across;
    const [lo, hi] = pitchLimits(s.cls, cabinGeometry(type));
    return [{ ...s, seatsAcross: across, pitchIn: Math.min(hi, Math.max(lo, s.pitchIn)) }];
  });
  return { sections };
}

/** Share of its deck's used length a section takes (0..1). */
export function sectionLengthShare(layout: CabinLayout, s: CabinSection): number {
  const total = layout.sections.filter(on(deckOf(s))).reduce((n, x) => n + x.rows * x.pitchIn, 0);
  return total > 0 ? (s.rows * s.pitchIn) / total : 0;
}

/** Share of the cabin length each section takes (0..1), for the proportion read-out. */
export function lengthShares(layout: CabinLayout): Record<CabinClass, number> {
  const total = layout.sections.reduce((n, s) => n + s.rows * s.pitchIn, 0);
  const out = { F: 0, J: 0, W: 0, Y: 0 } as Record<CabinClass, number>;
  if (total > 0) for (const s of layout.sections) out[s.cls] += (s.rows * s.pitchIn) / total;
  return out;
}

export function arrangementParts(label: string): number[] {
  return label.split("-").map((n) => Number(n)).filter((n) => n > 0);
}

export function arrangementLabel(type: AircraftType, cls: CabinClass, across: number, deck: Deck = "main"): string {
  return allowedAcross(type, cls, deck).find((o) => o.across === across)?.label ?? String(across);
}

export interface Projection { feasible: boolean; revenuePerFlight: number; profitPerFlight: number; loadFactor: number; reason?: string }

export const PROJECTION_ROUTES: Array<[string, string]> = [["LAX", "SFO"], ["LAX", "SAN"], ["LAX", "OGG"], ["LAX", "HNL"], ["SFO", "HNL"], ["SFO", "OGG"]];

/** Revenue and profit per flight for a layout on a route (full ledger via the route model, one fictional aircraft). */
export function projectRoute(
  type: AircraftType, layout: CabinLayout, origin: string, destination: string,
  airports: Airport[], types: AircraftType[], day: number, serviceLevels?: Partial<Record<CabinClass, ServiceLevel>>,
): Projection {
  const ap = new Map(airports.map((a) => [a.id, a]));
  const a = ap.get(origin), b = ap.get(destination);
  if (!a || !b || layout.sections.length === 0) return { feasible: false, revenuePerFlight: 0, profitPerFlight: 0, loadFactor: 0, reason: "No route or cabin." };
  const dist = distanceKm(a, b);
  const fare = Math.round(benchmarkFareFor(a, b, dist));
  const route = { id: "proj", origin, destination, weeklyFrequency: 7, fares: { Y: fare }, typeId: type.id };
  const ac = { id: "proj-ac", typeId: type.id, tailNumber: "PROJ", layout, status: "active" as const, ageDays: 0, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 } };
  const w = simulateRouteWeek(route, ap, new Map(types.map((t) => [t.id, t])), day, { fleetAircraft: [ac], chargeOwnership: true, serviceLevels });
  if (!w || !w.evaluation.feasible) return { feasible: false, revenuePerFlight: 0, profitPerFlight: 0, loadFactor: 0, reason: w?.evaluation.infeasibleReasons[0] ?? "Route not available." };
  const e = w.evaluation;
  const flights = Math.max(1, e.flightsPerWeek);
  return { feasible: true, revenuePerFlight: e.revenue / flights, profitPerFlight: e.profit / flights, loadFactor: e.loadFactor };
}

export const usd = (n: number): string => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}k` : `$${Math.round(a)}`;
  return n < 0 ? `-${s}` : s;
};

export function signed(n: number, digits = 1): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

/** Combined list of errors for a layout, plain strings. */
export function issues(type: AircraftType, layout: CabinLayout): { errors: string[]; warnings: string[] } {
  const v = validateCabinLayout(type, layout);
  return { errors: v.errors.map((e) => e.message), warnings: v.warnings.map((e) => e.message) };
}
