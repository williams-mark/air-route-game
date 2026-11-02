import type { AircraftType, CabinLayout, CabinSection } from "@arg/contracts";

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
  const across = type.widebody ? (type.maxSeats >= 480 ? 10 : type.maxSeats >= 330 ? 9 : 8) : type.maxSeats >= 120 ? 6 : 4;
  const rows = Math.max(1, Math.floor((target - used) / across));
  sections.push({ cls: "Y", rows, seatsAcross: across, pitchIn: 31 });
  return { sections };
}

export type LayoutError = "empty_layout" | "bad_section" | "too_many_seats";

/** Returns an error code and message, or null when the layout is legal for the type. */
export function validateLayout(type: AircraftType, layout: CabinLayout): { error: LayoutError; message: string } | null {
  if (!layout || !Array.isArray(layout.sections) || layout.sections.length === 0) {
    return { error: "empty_layout", message: "Cabin layout has no sections." };
  }
  for (const s of layout.sections) {
    if (!Number.isInteger(s.rows) || !Number.isInteger(s.seatsAcross) || s.rows < 1 || s.seatsAcross < 1 || !(s.pitchIn > 0)) {
      return { error: "bad_section", message: `Cabin section ${s.cls} needs positive whole rows and seats across, and a positive pitch.` };
    }
  }
  const seats = layoutSeats(layout);
  if (seats > type.maxSeats) {
    return { error: "too_many_seats", message: `${seats} seats exceeds the ${type.maxSeats}-seat maximum of the ${type.name}.` };
  }
  return null;
}
