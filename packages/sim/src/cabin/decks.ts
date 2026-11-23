// Two-deck aircraft (747 family, A380). The cabin geometry table (geometry.ts) gives these types one "equivalent" length that
// already counts the upper deck at main-deck width. A layout may put sections on the upper deck explicitly (CabinSection.deck):
// then each deck has its own length, width, aisles and seats-across rules. A layout with no upper-deck section is an older
// single-list layout and keeps the old rule (one equivalent length, main-deck seats across), so saves stay valid.
import type { AircraftType, CabinClass, CabinLayout, CabinSection } from "@arg/contracts";

export type Deck = "main" | "upper";

export interface UpperDeckSpec {
  /** Share of the type's usable (equivalent) cabin length that is on the upper deck. */
  share: number;
  /** Where the upper deck starts, as a share of the main deck's length from the nose (for the drawing). */
  start: number;
  /** Interior width of the upper deck at armrest height, metres. */
  widthM: number;
  aisles: 1 | 2;
  /** Seats across allowed upstairs per class, with arrangement labels. */
  across: Record<CabinClass, Array<{ across: number; label: string }>>;
}

const A = (across: number, label: string) => ({ across, label });

/**
 * ESTIMATES, not sourced figures. Shares: the short hump of the 747-100/-200/SP, the stretched upper deck of the 747-300/-400/-8
 * and the A380's full-length upper deck, as shares of the equivalent length the cabin table already uses. Widths: the 747's upper
 * deck is a narrowbody-like single-aisle cabin (about 3.6 m; business 2-2 or 1-1 lie-flat, economy 3-3 on some operators); the
 * A380's upper deck is a twin-aisle cabin about 5.8 m wide (economy 2-4-2, eight across, against ten on the main deck).
 */
const B747_UPPER: Omit<UpperDeckSpec, "share" | "start"> = {
  widthM: 3.6, aisles: 1,
  across: { F: [A(2, "1-1")], J: [A(2, "1-1"), A(4, "2-2")], W: [A(4, "2-2")], Y: [A(6, "3-3")] },
};
const A380_UPPER: Omit<UpperDeckSpec, "share" | "start"> = {
  widthM: 5.8, aisles: 2,
  across: { F: [A(2, "1-1"), A(3, "1-1-1"), A(4, "1-2-1")], J: [A(4, "1-2-1"), A(6, "2-2-2")], W: [A(6, "2-2-2"), A(7, "2-3-2")], Y: [A(8, "2-4-2")] },
};

/** The upper deck of a type, or null for single-deck types. */
export function upperDeckOf(type: Pick<AircraftType, "id">): UpperDeckSpec | null {
  const id = type.id;
  if (id.startsWith("A380")) return { share: 0.45, start: 0.06, ...A380_UPPER };
  if (!id.startsWith("B747")) return null;
  if (/^B747-?8/.test(id)) return { share: 0.2, start: 0.08, ...B747_UPPER };
  if (/^B747-(300|400)/.test(id)) return { share: 0.17, start: 0.08, ...B747_UPPER };
  return { share: 0.1, start: 0.1, ...B747_UPPER };
}

export const deckOf = (s: Pick<CabinSection, "deck">): Deck => (s.deck === "upper" ? "upper" : "main");

/** True when the layout places sections on the upper deck explicitly (per-deck rules apply). */
export const hasUpperDeckSections = (layout: CabinLayout): boolean => layout.sections.some((s) => s.deck === "upper");

/** Metres a list of sections on one deck needs: rows x pitch plus a 0.35 m divider between sections (rules.SECTION_DIVIDER_M). */
const deckLengthM = (secs: readonly CabinSection[]): number => secs.reduce((n, s) => n + s.rows * s.pitchIn * 0.0254, 0) + Math.max(0, secs.length - 1) * 0.35;

/**
 * A section of `cls` that fills what is left of a deck of `lengthM` after `before` (at most `maxRows` and `maxSeats` seats),
 * or null when not one row fits.
 */
export function fillDeckSection(before: readonly CabinSection[], lengthM: number, cls: CabinClass, seatsAcross: number, pitchIn: number, deck: Deck, maxRows = Infinity, maxSeats = Infinity): CabinSection | null {
  const left = lengthM - deckLengthM(before) - (before.length > 0 ? 0.35 : 0);
  const rows = Math.min(maxRows, Math.floor(maxSeats / seatsAcross), Math.floor(left / (pitchIn * 0.0254) + 1e-9));
  if (!(rows >= 1)) return null;
  return { cls, rows, seatsAcross, pitchIn, ...(deck === "upper" ? { deck: "upper" as const } : {}) };
}

/** The sections on one deck, in layout order. */
export const sectionsOnDeck = (layout: CabinLayout, deck: Deck): CabinSection[] => layout.sections.filter((s) => deckOf(s) === deck);
