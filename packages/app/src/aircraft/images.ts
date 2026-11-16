// Real photographs for the aircraft tiles, from Wikimedia Commons under free licences (CC BY, CC BY-SA, CC0 or public domain).
// `images.json` is the manifest: one entry per type with the file in public/aircraft/ and the credit the licence requires.
// A type without an entry draws the generic side view. Credits are shown in Settings ("Aircraft photo credits") and on each tile.
import manifest from "./images.json";

export interface AircraftImage {
  /** File name inside public/aircraft/. A resized copy of the original. */
  file: string;
  /** Title of the file on Wikimedia Commons. */
  title: string;
  /** Author as given on the file's Commons page. */
  author: string;
  /** Licence short name, e.g. "CC BY-SA 4.0". */
  license: string;
  /** The file's page on Wikimedia Commons (source, full licence text, original size). */
  page: string;
}

export const AIRCRAFT_IMAGES: Readonly<Record<string, AircraftImage>> = manifest;

/** URL of a type's image, or null when it has none (the tile then draws the generic side view). */
export function aircraftImageUrl(typeId: string, base: string = import.meta.env.BASE_URL): string | null {
  const img = AIRCRAFT_IMAGES[typeId];
  return img ? `${base}aircraft/${img.file}` : null;
}

/** One-line credit for a type's photo, or null. */
export function aircraftImageCredit(typeId: string): string | null {
  const img = AIRCRAFT_IMAGES[typeId];
  return img ? `Photo: ${img.author || "unknown author"}, ${img.license}, via Wikimedia Commons` : null;
}
