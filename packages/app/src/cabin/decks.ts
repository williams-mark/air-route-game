// Display-only split of a cabin layout over two passenger decks (747 family, A380). The sim's cabin model is one equivalent
// length that already counts the upper deck (sim cabin/geometry.ts), so capacity, comfort and cost are untouched by this file.
import type { CabinLayout, CabinSection } from "@arg/contracts";
import { SECTION_DIVIDER_M } from "@arg/sim";

export interface DeckSpec {
  /** Share of the usable (equivalent) cabin length that is on the upper deck. */
  upperShare: number;
  /** Where the upper deck starts, as a share of the main deck's length from the nose. */
  upperStart: number;
  /** Upper-deck cabin width relative to the main deck (for the drawing only). */
  upperWidth: number;
}

/**
 * ESTIMATES for the drawing, not sourced figures: the short hump of the 747-100/-200/SP, the stretched upper deck of the
 * 747-300/-400/-8, and the A380's full-length upper deck. They only decide how many rows are drawn upstairs.
 */
export function deckSpecFor(typeId: string): DeckSpec | null {
  if (typeId.startsWith("A380")) return { upperShare: 0.45, upperStart: 0.06, upperWidth: 0.88 };
  if (!typeId.startsWith("B747")) return null;
  if (/^B747-?8/.test(typeId)) return { upperShare: 0.2, upperStart: 0.08, upperWidth: 0.6 };
  if (/^B747-(300|400)/.test(typeId)) return { upperShare: 0.17, upperStart: 0.08, upperWidth: 0.6 };
  return { upperShare: 0.1, upperStart: 0.1, upperWidth: 0.6 };
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
