// Inline notes for typed numbers the app changes (rounds or clamps). Pure, so the rules are unit-tested without a DOM.
// Pattern: the field shows the note next to it whenever the value it holds differs from what was typed.

export interface FittedWhole { value: number; note: string | null }

/**
 * Fits a typed number to a whole number in [min, max]: rounds, then clamps, and says what it changed.
 * `notes.high` / `notes.low` are shown when the value is clamped; "Whole numbers only." when it is rounded.
 */
export function fitWhole(raw: number, min: number, max: number, notes: { high: string; low: string }): FittedWhole {
  if (!Number.isFinite(raw)) return { value: min, note: `Enter a whole number from ${min} to ${max}.` };
  const rounded = Math.round(raw);
  if (rounded > max) return { value: max, note: notes.high };
  if (rounded < min) return { value: min, note: notes.low };
  return { value: rounded, note: rounded === raw ? null : "Whole numbers only." };
}

/** Note for a typed fare (one way, USD): null when it is a usable whole dollar amount or blank. */
export function fareNote(text: string): string | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return "Enter a dollar amount.";
  if (n <= 0) return "Fares must be above $0.";
  if (!Number.isInteger(n)) return `Whole dollars only: $${Math.round(n)} is used.`;
  return null;
}
