import type { AircraftType } from "@arg/contracts";

/** Family of every type id in @arg/data. Pure lookup; a test checks that every data id is listed here. */
export const FAMILY_BY_ID: Readonly<Record<string, string>> = {
  "B737-700": "737 NG", "B737-800": "737 NG", "B737-900ER": "737 NG",
  "B737-8": "737 MAX", "B737-9": "737 MAX",
  "B757-200": "757", "B767-300ER": "767",
  "B777-200ER": "777", "B777-300ER": "777",
  "B787-8": "787", "B787-9": "787", "B787-10": "787",
  "B747-400": "747",
  "DC10-30": "DC-10",
  "A319": "A320 family", "A320": "A320 family", "A321": "A320 family", "A320N": "A320 family", "A321N": "A320 family",
  "A220-100": "A220", "A220-300": "A220",
  "A330-200": "A330", "A330-300": "A330", "A330-900": "A330",
  "A350-900": "A350", "A350-1000": "A350",
  "E175": "E-Jet",
  "CRJ700": "CRJ family", "CRJ900": "CRJ family",
  "ATR72-600": "ATR 72",
  "DC8-10": "DC-8",
  "DC8-20": "DC-8",
  "DC8-30": "DC-8",
  "DC8-40": "DC-8",
  "DC8-50": "DC-8",
  "DC8-61": "DC-8",
  "DC8-62": "DC-8",
  "DC8-63": "DC-8",
  "DC9-10": "DC-9",
  "DC9-30": "DC-9",
  "DC9-40": "DC-9",
  "DC9-50": "DC-9",
  "MD81": "MD-80",
  "MD82": "MD-80",
  "MD83": "MD-80",
  "MD87": "MD-80",
  "MD88": "MD-80",
  "MD90-30": "MD-90",
  "MD11": "MD-11",
  "DC10-10": "DC-10",
  "DC10-40": "DC-10",
  "L1011-1": "L-1011",
  "L1011-100": "L-1011",
  "L1011-200": "L-1011",
  "L1011-500": "L-1011",
  "CV880": "Convair 880/990",
  "CV990": "Convair 880/990",
  "BAC111-200": "One-Eleven",
  "BAC111-500": "One-Eleven",
  "TRIDENT-1C": "Trident",
  "TRIDENT-2E": "Trident",
  "TRIDENT-3B": "Trident",
  "CARAVELLE-6R": "Caravelle",
  "CARAVELLE-12": "Caravelle",
  "F28-1000": "F28/F100",
  "F28-3000": "F28/F100",
  "F28-4000": "F28/F100",
  "F100": "F28/F100",
  "BAE146-100": "BAe 146",
  "BAE146-200": "BAe 146",
  "BAE146-300": "BAe 146",
  "CONCORDE": "Concorde",
};

/** Display order of families inside a manufacturer (unlisted families sort after, alphabetically). */
export const FAMILY_ORDER: readonly string[] = ["A220", "A320 family", "A330", "A350", "737 NG", "737 MAX", "757", "767", "777", "787", "747", "DC-10", "CRJ family", "E-Jet", "ATR 72"];

/** The family tile an aircraft type belongs to. Falls back to the type's own name for ids not in the table. */
export function familyOf(type: Pick<AircraftType, "id" | "name">): string {
  return FAMILY_BY_ID[type.id] ?? type.name;
}

export interface FamilyNode { family: string; types: AircraftType[] }
export interface ManufacturerNode { manufacturer: string; families: FamilyNode[] }

const famRank = (f: string) => { const i = FAMILY_ORDER.indexOf(f); return i < 0 ? 999 : i; };

/** manufacturer -> family -> variants (variants by seats, then name). */
export function buildTree(types: readonly AircraftType[]): ManufacturerNode[] {
  const byMan = new Map<string, Map<string, AircraftType[]>>();
  for (const t of types) {
    const fams = byMan.get(t.manufacturer) ?? new Map<string, AircraftType[]>();
    const fam = familyOf(t);
    fams.set(fam, [...(fams.get(fam) ?? []), t]);
    byMan.set(t.manufacturer, fams);
  }
  return [...byMan]
    .map(([manufacturer, fams]) => ({
      manufacturer,
      families: [...fams]
        .map(([family, ts]) => ({ family, types: [...ts].sort((a, b) => a.maxSeats - b.maxSeats || a.name.localeCompare(b.name)) }))
        .sort((a, b) => famRank(a.family) - famRank(b.family) || a.family.localeCompare(b.family)),
    }))
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer));
}

/** Where a type sits in the tree: [manufacturer, family]. */
export const pathOf = (t: AircraftType): [string, string] => [t.manufacturer, familyOf(t)];
