import { aircraftTypes } from "@arg/data";

// One short display name per aircraft type, used by every view, card, toast and table.
// The data name is "Airbus A321ceo" or "Boeing 737-800"; the short form drops the maker and keeps the
// Boeing "B" prefix ("B737-800"), so "A321ceo", "A320neo" and "B737-800" read the same everywhere.

const MAKER = /^(Airbus|Boeing|Embraer|Bombardier|McDonnell Douglas|Douglas|Lockheed|Convair|BAC|Hawker Siddeley|Sud Aviation|Fokker|British Aerospace|Aerospatiale-BAC)\s+/;

export function typeShortName(t: { name: string; manufacturer: string }): string {
  const bare = t.name.replace(MAKER, "");
  return t.manufacturer === "Boeing" && /^\d/.test(bare) ? `B${bare}` : bare;
}

/** Short name for a type id, falling back to the id itself when the type is unknown. */
export function typeLabel(types: ReadonlyArray<{ id: string; name: string; manufacturer: string }>, id: string): string {
  const t = types.find((x) => x.id === id);
  return t ? typeShortName(t) : id;
}

/** Short label for a type id from the static catalogue (the same one the sim is built from). */
export const shortTypeLabel = (id: string): string => typeLabel(aircraftTypes, id);
