import type { AircraftType } from "@arg/contracts";

/**
 * Cabin geometry assumptions per aircraft type, used by the cabin editor to work out how many rows fit.
 *
 * SOURCES AND CONFIDENCE. These are approximations, not sourced dataset values (the sourced data in
 * packages/data stays untouched). Interior widths are rounded from the manufacturers' published fuselage and
 * cabin cross-section figures as reproduced on Wikipedia and in airport-planning documents (A320 family 3.70 m,
 * 737 3.54 m, A220 3.28 m, E175 2.74 m, CRJ 2.51 m, ATR 72 2.57 m, 757 3.54 m, 767 4.72 m, A330 5.28 m,
 * A350 5.61 m, 787 5.49 m, 777 5.87 m, 747 6.10 m main deck); expect +-3 %. Cabin lengths are estimates (+-10 %)
 * from the same sources (e.g. A320 27.5 m, A321 34.4 m, A330-300 about 48 m), then raised where needed so that the
 * type's certified `maxSeats` fits as a single all-economy cabin at 28 in pitch in the widest sensible abreast.
 * That calibration makes `maxSeats` the binding limit for dense layouts (it stands in for the exit limit, which the
 * dataset does not carry) and the geometry the binding limit for premium-heavy ones. The 747's figure counts the
 * upper deck as extra equivalent length.
 *
 * Usable length = cabin length minus the service allowance (galleys, lavatories, door areas, crew rest):
 * 3 m regional, 4.5 m narrowbody, 8 m widebody.
 */
export type BodyClass = "regional" | "narrow" | "widebody";

export interface CabinGeometry {
  bodyClass: BodyClass;
  /** Interior width at armrest height, metres. */
  cabinWidthM: number;
  /** Cabin length, metres. */
  cabinLengthM: number;
  /** Galleys, lavatories, doors. */
  serviceAllowanceM: number;
  /** Length available for seat rows, metres. */
  usableLengthM: number;
  /** Widest sensible economy abreast count on this type. */
  maxAbreast: number;
  /** Economy abreast counts that exist in service on this type. */
  yAbreast: number[];
  /** Aisles: 1 for single-aisle types, 2 for widebodies. */
  aisles: 1 | 2;
}

type Row = [lengthM: number, widthM: number, yAbreast: number[]];
const R4: number[] = [4];
const TABLE: Record<string, Row> = {
  "B737-700": [24.0, 3.54, [6]],
  "B737-800": [29.5, 3.54, [6]],
  "B737-900ER": [32.4, 3.54, [6]],
  "B737-8": [29.8, 3.54, [6]],
  "B737-9": [32.6, 3.54, [6]],
  A319: [23.8, 3.7, [6]],
  A320: [27.5, 3.7, [6]],
  A321: [34.4, 3.7, [6]],
  A320N: [27.9, 3.7, [6]],
  A321N: [34.4, 3.7, [6]],
  "A220-100": [24.0, 3.28, [5]],
  "A220-300": [28.0, 3.28, [5]],
  E175: [20.5, 2.74, R4],
  CRJ700: [17.0, 2.51, R4],
  CRJ900: [19.5, 2.51, R4],
  "ATR72-600": [19.5, 2.57, R4],
  "B757-200": [36.0, 3.54, [6]],
  "B767-300ER": [44.0, 4.72, [7, 8, 9]],
  "B777-200ER": [49.0, 5.87, [9, 10]],
  "B777-300ER": [59.0, 5.87, [9, 10]],
  "B787-8": [44.0, 5.49, [8, 9]],
  "B787-9": [49.5, 5.49, [8, 9]],
  "B787-10": [55.0, 5.49, [8, 9]],
  "A330-200": [44.0, 5.28, [8, 9]],
  "A330-300": [48.5, 5.28, [8, 9]],
  "A330-900": [49.5, 5.28, [8, 9]],
  "A350-900": [51.0, 5.61, [8, 9]],
  "A350-1000": [58.0, 5.61, [8, 9]],
  "B747-400": [70.0, 6.1, [10]],
  // ESTIMATE (lane/aircraft-airbus): cabin length = overall length (SOURCES.md) less about 10 m (narrow) or 15 m (wide-body), the margin the existing rows use; width from the A330/A350 cross-section class (A300 and A340 share the 5.28 m figure used for the A330; A380 main deck 6.5 m is an ESTIMATE). A380 length counts the upper deck as extra equivalent length, as for the 747.
  A318: [21.5, 3.7, [6]],
  "A330-800": [43.5, 5.28, [8, 9]],
  "A340-200": [44.5, 5.28, [8, 9]],
  "A340-300": [48.5, 5.28, [8, 9]],
  "A340-500": [52.5, 5.28, [8, 9]],
  "A340-600": [60.0, 5.28, [8, 9]],
  "A380-800": [72.0, 6.5, [10, 11]],
  "A300B4-200": [38.5, 5.28, [8, 9]],
  "A300-600R": [39.0, 5.28, [8, 9]],
  // ESTIMATE (lane/start-year): DC-10 cabin length about 42 m (overall length ~55 m less nose and tail cone), width typical of the wide-body fallback.
  "DC10-30": [42.0, 5.5, [8, 9]],
};

const SERVICE_M: Record<BodyClass, number> = { regional: 3, narrow: 4.5, widebody: 8 };

/** Geometry for a type. Unknown ids (test fixtures) are derived from `widebody` and `maxSeats`. */
export function cabinGeometry(type: Pick<AircraftType, "id" | "widebody" | "maxSeats">): CabinGeometry {
  const row = TABLE[type.id];
  const bodyClass: BodyClass = type.widebody ? "widebody" : type.maxSeats <= 100 ? "regional" : "narrow";
  let length: number, width: number, yAbreast: number[];
  if (row) {
    [length, width, yAbreast] = row;
  } else if (type.widebody) {
    width = 5.5;
    yAbreast = type.maxSeats >= 480 ? [9, 10] : [8, 9];
    length = (type.maxSeats / yAbreast[yAbreast.length - 1]!) * 28 * 0.0254 + SERVICE_M.widebody;
  } else {
    width = bodyClass === "regional" ? 2.6 : 3.6;
    yAbreast = bodyClass === "regional" ? R4 : [6];
    length = (type.maxSeats / yAbreast[0]!) * 28 * 0.0254 + SERVICE_M[bodyClass];
  }
  const serviceAllowanceM = SERVICE_M[bodyClass];
  return {
    bodyClass, cabinWidthM: width, cabinLengthM: length, serviceAllowanceM,
    usableLengthM: Math.max(0, length - serviceAllowanceM),
    maxAbreast: Math.max(...yAbreast), yAbreast: [...yAbreast],
    aisles: type.widebody ? 2 : 1,
  };
}
