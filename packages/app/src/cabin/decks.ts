// How a cabin layout is drawn over the two passenger decks of a 747 or A380. The deck rules themselves (length share, width,
// aisles, seats across upstairs) live in the sim (cabin/decks.ts); this file only adapts them for the seat map.
import type { CabinLayout, CabinSection } from "@arg/contracts";
import { cabinGeometry, hasUpperDeckSections, sectionsOnDeck, SECTION_DIVIDER_M, upperDeckOf } from "@arg/sim";

export interface DeckSpec {
  /** Share of the usable (equivalent) cabin length that is on the upper deck. */
  upperShare: number;
  /** Where the upper deck starts, as a share of the main deck's length from the nose. */
  upperStart: number;
  /** Upper-deck cabin width relative to the main deck (for the drawing only). */
  upperWidth: number;
}

/** Drawing figures for a two-deck type, from the sim's upper-deck spec (estimates, see the sim's cabin/decks.ts). */
export function deckSpecFor(typeId: string): DeckSpec | null {
  const up = upperDeckOf({ id: typeId });
  if (!up) return null;
  const mainWidth = cabinGeometry({ id: typeId, widebody: true, maxSeats: 400 }).cabinWidthM;
  return { upperShare: up.share, upperStart: up.start, upperWidth: up.widthM / mainWidth };
}

/**
 * The sections drawn on each deck. A layout that uses the upper deck is drawn as it is (each section on its own deck). An older
 * layout with no upper-deck section is one equivalent length in the sim, so it is drawn entirely on the main deck and the upper
 * deck is left empty (`legacy`), rather than drawing main-deck rows upstairs at main-deck width.
 */
export function layoutByDeck(layout: CabinLayout): { upper: CabinLayout; main: CabinLayout; legacy: boolean } {
  if (!hasUpperDeckSections(layout)) return { upper: { sections: [] }, main: layout, legacy: true };
  return { upper: { sections: sectionsOnDeck(layout, "upper") }, main: { sections: sectionsOnDeck(layout, "main") }, legacy: false };
}

const rowM = (s: CabinSection) => s.pitchIn * 0.0254;

/**
 * Split a layout over the decks: rows from the front of the layout (the premium cabins) go upstairs until the upper deck's
 * length is used, the rest stay on the main deck. A section may be cut at a row boundary. Every seat appears exactly once.
 */
export function splitLayout(layout: CabinLayout, upperLengthM: number): { upper: CabinLayout; main: CabinLayout } {
  const upper: CabinSection[] = [], main: CabinSection[] = [];
  let left = upperLengthM, open = true;
  for (const s of layout.sections) {
    let up = 0;
    if (open) {
      const room = left - (upper.length > 0 ? SECTION_DIVIDER_M : 0);
      up = Math.max(0, Math.min(s.rows, Math.floor(room / rowM(s) + 1e-9)));
      if (up > 0) { upper.push({ ...s, rows: up }); left = room - up * rowM(s); }
      if (up < s.rows) open = false;
    }
    if (s.rows - up > 0) main.push({ ...s, rows: s.rows - up });
  }
  return { upper: { ...layout, sections: upper }, main: { ...layout, sections: main } };
}
