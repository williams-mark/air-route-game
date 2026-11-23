import type { AircraftType, CabinLayout, CabinSection } from "@arg/contracts";
import { allowedAcross, deckLengths, validateLayout as validateCabinRules } from "../cabin/rules";
import { fillDeckSection, upperDeckOf } from "../cabin/decks";

/** Fraction of the type's maximum (high-density) seat count that a default full-service layout keeps. */
export const DEFAULT_LAYOUT_FRACTION = { narrow: 0.86, wide: 0.78 } as const;

/** Seats in a layout. */
export function layoutSeats(layout: CabinLayout): number {
  return layout.sections.reduce((s, c) => s + c.rows * c.seatsAcross, 0);
}

/**
 * A plausible default cabin for a type: narrowbody J 3 rows x 4 + Y 6-abreast; widebody J 6 rows x 6 (2-2-2),
 * premium economy 5 rows x 7 on the big ones, Y 9/10-abreast (8-abreast on 767/787-class, ~8 on 777 ten).
 * Seat counts approximate the type's `maxSeats` times `DEFAULT_LAYOUT_FRACTION`. Not sourced data.
 */
export function defaultLayout(type: AircraftType): CabinLayout {
  const target = Math.floor(type.maxSeats * (type.widebody ? DEFAULT_LAYOUT_FRACTION.wide : DEFAULT_LAYOUT_FRACTION.narrow));
  const twoDeck = twoDeckDefault(type, target);
  if (twoDeck) return twoDeck;
  const sections: CabinSection[] = [];
  let used = 0;
  if (type.widebody) {
    sections.push({ cls: "J", rows: 6, seatsAcross: 6, pitchIn: 60 });
    used += 36;
    if (type.maxSeats >= 380) {
      sections.push({ cls: "W", rows: 4, seatsAcross: 7, pitchIn: 38 });
      used += 28;
    }
  } else if (type.maxSeats >= 120) {
    sections.push({ cls: "J", rows: 3, seatsAcross: 4, pitchIn: 37 });
    used += 12;
  }
  const wanted = type.widebody ? (type.maxSeats >= 480 ? 10 : type.maxSeats >= 330 ? 9 : 8) : type.maxSeats >= 120 ? 6 : 4;
  // Economy abreast must be one the cabin rules allow for this type (A220 is 5-abreast, A350 8 or 9): take the widest allowed <= wanted.
  const allowed = allowedAcross(type, "Y").map((o) => o.across);
  const across = allowed.filter((n) => n <= wanted).pop() ?? allowed[0] ?? wanted;
  const rows = Math.max(1, Math.floor((target - used) / across));
  sections.push({ cls: "Y", rows, seatsAcross: across, pitchIn: 31 });
  return { sections };
}

/**
 * Default cabin of a 747 or A380, with the upper deck set up (cabin/decks.ts): business upstairs (2-2 on the 747; 1-2-1 on the
 * A380, with economy 2-4-2 behind it as on several operators), premium economy 2-3-2 and economy ten across on the main deck.
 * Seats stay within `target`. Not sourced data. Null for single-deck types.
 */
function twoDeckDefault(type: AircraftType, target: number): CabinLayout | null {
  const up = upperDeckOf(type), lengths = deckLengths(type);
  if (!up || !lengths) return null;
  const a380 = up.aisles === 2;
  const upper: CabinSection[] = [];
  const j = fillDeckSection(upper, lengths.upper, "J", 4, 60, "upper", a380 ? 10 : Infinity);
  if (j) upper.push(j);
  if (a380) { const uy = fillDeckSection(upper, lengths.upper, "Y", 8, 31, "upper"); if (uy) upper.push(uy); }
  const main: CabinSection[] = [];
  let used = upper.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
  if (!a380 && type.maxSeats >= 380) { main.push({ cls: "W", rows: 4, seatsAcross: 7, pitchIn: 38 }); used += 28; }
  const yAcross = allowedAcross(type, "Y").map((o) => o.across).filter((n) => n <= 10).pop() ?? 10;
  const y = fillDeckSection(main, lengths.main, "Y", yAcross, 31, "main", Infinity, Math.max(yAcross, target - used));
  if (y) main.push(y);
  // Front to back: premium cabins first (upper deck listed first, then the main deck).
  return { sections: [...upper, ...main] };
}

export type LayoutError = "empty_layout" | "bad_section" | "too_many_seats" | "duplicate_class" | "class_unavailable" | "bad_across" | "bad_pitch" | "too_long" | "no_upper_deck";

/**
 * Returns an error code and message, or null when the layout is legal for the type. This is the single rule set
 * (cabin/rules.ts) used by defaults, orders, offers, refits and the designer; only the first error is reported here.
 */
export function validateLayout(type: AircraftType, layout: CabinLayout): { error: LayoutError; message: string } | null {
  if (!layout || !Array.isArray(layout.sections)) return { error: "empty_layout", message: "Cabin layout has no sections." };
  const v = validateCabinRules(type, layout);
  const e = v.errors[0];
  return e ? { error: e.code as LayoutError, message: e.message } : null;
}
