import type { AircraftType, CabinClass, CabinLayout, CabinSection } from "@arg/contracts";
import { cabinGeometry, type CabinGeometry } from "./geometry";

export const CABIN_CLASSES: readonly CabinClass[] = ["F", "J", "W", "Y"];
export const CLASS_NAME: Record<CabinClass, string> = { F: "First", J: "Business", W: "Premium economy", Y: "Economy" };
export const INCH_M = 0.0254;
/** Extra length per section for the bulkhead / curtain / class divider, metres. */
export const SECTION_DIVIDER_M = 0.35;

export interface AcrossOption {
  across: number;
  /** Arrangement, e.g. "2-4-2". */
  label: string;
}

export const ARRANGEMENT: Record<number, string> = {
  1: "1", 2: "1-1", 3: "1-1-1", 4: "2-2", 5: "2-3", 6: "3-3", 7: "2-3-2", 8: "2-4-2", 9: "3-3-3", 10: "3-4-3",
};
/** Widebody premium seats use two aisles with these arrangements. */
const WIDE_ARRANGEMENT: Record<number, string> = { 2: "1-1", 3: "1-1-1", 4: "1-2-1", 6: "2-2-2", 7: "2-3-2", 8: "2-4-2" };
const NARROW_ARRANGEMENT: Record<number, string> = { 2: "1-1", 3: "1-2", 4: "2-2", 5: "2-3", 6: "3-3" };

/** Pitch limits in inches per class and body (below min is not certifiable/credible; above max is not modelled). */
export const PITCH_LIMITS: Record<CabinClass, { narrow: [number, number]; wide: [number, number] }> = {
  F: { narrow: [40, 60], wide: [70, 90] },
  J: { narrow: [34, 44], wide: [50, 80] },
  W: { narrow: [34, 42], wide: [36, 44] },
  Y: { narrow: [28, 36], wide: [28, 36] },
};
export function pitchLimits(cls: CabinClass, geo: CabinGeometry): [number, number] {
  return PITCH_LIMITS[cls][geo.bodyClass === "widebody" ? "wide" : "narrow"];
}

/**
 * Allowed seats-across per class for a type, with arrangement labels.
 * First: widebody 2 (1-1), 3 (1-1-1) or 4 (1-2-1); narrowbody 2 (1-1) or 4 (2-2) (regional jets and turboprops: none).
 * Business: widebody 4 (1-2-1) or 6 (2-2-2); narrowbody 4 (2-2) or 6 (3-3, high density, on 6-abreast types);
 *   regional 3 (1-2) or 4 (2-2).
 * Premium economy: widebody 6 to 8 (2-2-2, 2-3-2, 2-4-2) not above the economy abreast; narrowbody 4 or 6 where the
 *   fuselage allows; regional none.
 * Economy: the type's in-service abreast counts (narrowbody 6 (3-3), A220 5 (2-3), regional 4 (2-2); widebody
 *   7 (2-3-2) to 10 (3-4-3)). 11-abreast on the 777 is not offered (impractical).
 */
export function allowedAcross(type: Pick<AircraftType, "id" | "widebody" | "maxSeats">, cls: CabinClass): AcrossOption[] {
  const geo = cabinGeometry(type);
  const wide = geo.bodyClass === "widebody";
  const labels = wide ? WIDE_ARRANGEMENT : NARROW_ARRANGEMENT;
  const lab = (n: number) => labels[n] ?? ARRANGEMENT[n] ?? String(n);
  let list: number[];
  switch (cls) {
    case "F": list = wide ? [2, 3, 4] : geo.bodyClass === "regional" ? [] : [2, 4]; break;
    case "J": list = wide ? [4, 6] : geo.bodyClass === "regional" ? [3, 4] : [4, 6].filter((n) => n <= geo.maxAbreast); break;
    case "W": list = wide ? [6, 7, 8].filter((n) => n <= geo.maxAbreast) : geo.bodyClass === "regional" ? [] : [4, 6].filter((n) => n <= geo.maxAbreast); break;
    case "Y": list = geo.yAbreast; break;
  }
  if (wide && cls === "Y") return list.map((n) => ({ across: n, label: ARRANGEMENT[n] ?? String(n) }));
  return list.map((n) => ({ across: n, label: lab(n) }));
}

export type IssueCode =
  | "empty_layout" | "bad_section" | "duplicate_class" | "class_unavailable" | "bad_across" | "bad_pitch"
  | "too_many_seats" | "too_long" | "no_economy";

export interface LayoutIssue { code: IssueCode; message: string; cls?: CabinClass }
export interface LayoutValidation {
  ok: boolean;
  /** Blocking problems. */
  errors: LayoutIssue[];
  /** Legal but questionable. */
  warnings: LayoutIssue[];
  seats: number;
  maxSeats: number;
  /** Cabin length the rows need, metres, and the length available. */
  lengthUsedM: number;
  lengthAvailableM: number;
}

export function sectionSeats(s: CabinSection): number { return s.rows * s.seatsAcross; }
export function totalSeats(layout: CabinLayout): number { return layout.sections.reduce((n, s) => n + sectionSeats(s), 0); }

/** Metres of cabin the layout needs: rows x pitch plus a divider per extra section. */
export function layoutLengthM(layout: CabinLayout): number {
  const rowsM = layout.sections.reduce((n, s) => n + s.rows * s.pitchIn * INCH_M, 0);
  return rowsM + Math.max(0, layout.sections.length - 1) * SECTION_DIVIDER_M;
}

/**
 * Validate a cabin layout against the type: seat count within the certified maximum (`maxSeats` stands in for the
 * exit limit, which the dataset does not carry), rows x pitch within the usable cabin length, seats-across and
 * pitch in the allowed sets per class and body type, one section per class.
 */
export function validateLayout(type: AircraftType, layout: CabinLayout): LayoutValidation {
  const geo = cabinGeometry(type);
  const errors: LayoutIssue[] = [];
  const warnings: LayoutIssue[] = [];
  const secs = layout?.sections ?? [];
  if (secs.length === 0) errors.push({ code: "empty_layout", message: "The cabin has no seats." });
  const seen = new Set<CabinClass>();
  for (const s of secs) {
    const name = CLASS_NAME[s.cls];
    if (!Number.isInteger(s.rows) || s.rows < 1 || !Number.isInteger(s.seatsAcross) || s.seatsAcross < 1 || !(s.pitchIn > 0)) {
      errors.push({ code: "bad_section", cls: s.cls, message: `${name} needs whole rows (1 or more), a seats-across count and a positive pitch.` });
      continue;
    }
    if (seen.has(s.cls)) errors.push({ code: "duplicate_class", cls: s.cls, message: `${name} appears in more than one section.` });
    seen.add(s.cls);
    const opts = allowedAcross(type, s.cls);
    if (opts.length === 0) {
      errors.push({ code: "class_unavailable", cls: s.cls, message: `The ${type.name} cannot carry a ${name.toLowerCase()} cabin.` });
      continue;
    }
    if (!opts.some((o) => o.across === s.seatsAcross)) {
      errors.push({ code: "bad_across", cls: s.cls, message: `${s.seatsAcross} across is not available in ${name.toLowerCase()} on the ${type.name} (allowed: ${opts.map((o) => `${o.across} (${o.label})`).join(", ")}).` });
    }
    const [lo, hi] = pitchLimits(s.cls, geo);
    if (s.pitchIn < lo || s.pitchIn > hi) {
      errors.push({ code: "bad_pitch", cls: s.cls, message: `${name} pitch must be ${lo} to ${hi} in (is ${s.pitchIn}).` });
    }
  }
  const seats = secs.reduce((n, s) => n + (Number.isInteger(s.rows) && Number.isInteger(s.seatsAcross) ? s.rows * s.seatsAcross : 0), 0);
  if (seats > type.maxSeats) {
    errors.push({ code: "too_many_seats", message: `${seats} seats exceeds the ${type.maxSeats}-seat certified maximum of the ${type.name}.` });
  }
  const lengthUsedM = layoutLengthM({ sections: secs.filter((s) => s.pitchIn > 0 && s.rows > 0) });
  if (lengthUsedM > geo.usableLengthM + 1e-9) {
    errors.push({ code: "too_long", message: `The rows need ${lengthUsedM.toFixed(1)} m of cabin but only ${geo.usableLengthM.toFixed(1)} m is usable.` });
  }
  if (secs.length > 0 && !seen.has("Y")) warnings.push({ code: "no_economy", message: "No economy cabin: all passengers must fit in premium cabins, which only fill on premium-heavy routes." });
  if (seats > 0 && seats === type.maxSeats) warnings.push({ code: "too_many_seats", message: "At the certified seat maximum." });
  return { ok: errors.length === 0, errors, warnings, seats, maxSeats: type.maxSeats, lengthUsedM, lengthAvailableM: geo.usableLengthM };
}

/** Rows of a class that would use up `lengthM` of cabin at a pitch. */
export function rowsFitting(lengthM: number, pitchIn: number): number {
  return Math.max(0, Math.floor(lengthM / (pitchIn * INCH_M) + 1e-9));
}
